import { closeSync, openSync, readSync } from 'node:fs'
import { inflateSync, zstdDecompressSync } from 'node:zlib'
import { PbfReader } from 'pbf'

// Reads OpenStreetMap PBF files: https://wiki.openstreetmap.org/wiki/PBF_Format

export type Tags = { readonly [key: string]: string }

export type Member = { type: 'node' | 'way' | 'relation'; id: number; role: string }

export type OsmHandlers = {
  node?: (id: number, lat: number, lon: number, tags: Tags) => void
  way?: (id: number, refs: readonly number[], tags: Tags) => void
  relation?: (id: number, members: readonly Member[], tags: Tags) => void
}

const SUPPORTED_FEATURES = new Set(['OsmSchema-V0.6', 'DenseNodes'])
const MEMBER_TYPES = ['node', 'way', 'relation'] as const
const NO_TAGS: Tags = Object.freeze({})

// Calls only the handlers given, and skips the element kinds that have none without decoding them.
export function readOsmPbf(path: string, handlers: OsmHandlers): void {
  const file = openSync(path, 'r')
  try {
    let offset = 0
    const lengthBytes = Buffer.alloc(4)
    while (readSync(file, lengthBytes, 0, 4, offset) === 4) {
      const headerLength = lengthBytes.readUInt32BE(0)
      const header = readBlobHeader(readExactly(file, headerLength, offset + 4))
      const blob = readExactly(file, header.dataSize, offset + 4 + headerLength)
      offset += 4 + headerLength + header.dataSize
      if (header.type === 'OSMHeader') checkFeatures(unpackBlob(blob))
      else if (header.type === 'OSMData') readPrimitiveBlock(unpackBlob(blob), handlers)
    }
  } finally {
    closeSync(file)
  }
}

function readExactly(file: number, length: number, position: number): Buffer {
  const buffer = Buffer.alloc(length)
  if (readSync(file, buffer, 0, length, position) !== length) throw new Error('The PBF file ends partway through a block')
  return buffer
}

function readBlobHeader(bytes: Uint8Array): { type: string; dataSize: number } {
  const pbf = new PbfReader(bytes)
  let type = ''
  let dataSize = 0
  for (let field; (field = pbf.nextField()); ) {
    if (field === 1) type = pbf.readString()
    else if (field === 3) dataSize = pbf.readVarint()
  }
  return { type, dataSize }
}

function unpackBlob(bytes: Uint8Array): Uint8Array {
  const pbf = new PbfReader(bytes)
  for (let field; (field = pbf.nextField()); ) {
    if (field === 1) return pbf.readBytes()
    if (field === 3) return inflateSync(pbf.readBytes())
    if (field === 7) return zstdDecompressSync(pbf.readBytes())
    if (field === 4 || field === 5 || field === 6) throw new Error('Only raw, zlib and zstd PBF blocks are supported')
  }
  throw new Error('A PBF block has no data')
}

function checkFeatures(bytes: Uint8Array): void {
  const pbf = new PbfReader(bytes)
  for (let field; (field = pbf.nextField()); ) {
    if (field !== 4) continue
    const feature = pbf.readString()
    if (!SUPPORTED_FEATURES.has(feature)) throw new Error(`The PBF file needs unsupported feature ${feature}`)
  }
}

type Block = { strings: string[]; granularity: number; latOffset: number; lonOffset: number }

function readPrimitiveBlock(bytes: Uint8Array, handlers: OsmHandlers): void {
  const pbf = new PbfReader(bytes)
  const block: Block = { strings: [], granularity: 100, latOffset: 0, lonOffset: 0 }
  // Groups can come before the fields that say how to read their coordinates, so they are read last.
  const groupStarts: number[] = []
  for (let field; (field = pbf.nextField()); ) {
    if (field === 1) block.strings = readStringTable(pbf)
    else if (field === 2) groupStarts.push(pbf.pos)
    else if (field === 17) block.granularity = pbf.readVarint()
    else if (field === 19) block.latOffset = pbf.readVarint(true)
    else if (field === 20) block.lonOffset = pbf.readVarint(true)
  }
  for (const start of groupStarts) {
    pbf.pos = start
    const end = pbf.readVarint() + pbf.pos
    for (let field; (field = pbf.nextField(end)); ) {
      if (field === 1 && handlers.node) readNode(pbf, block, handlers.node)
      else if (field === 2 && handlers.node) readDenseNodes(pbf, block, handlers.node)
      else if (field === 3 && handlers.way) readWay(pbf, block, handlers.way)
      else if (field === 4 && handlers.relation) readRelation(pbf, block, handlers.relation)
    }
  }
}

function readStringTable(pbf: PbfReader): string[] {
  const strings: string[] = []
  const end = pbf.readVarint() + pbf.pos
  for (let field; (field = pbf.nextField(end)); ) {
    if (field === 1) strings.push(pbf.readString())
  }
  return strings
}

function toDegrees(block: Block, offset: number, value: number): number {
  return (offset + block.granularity * value) / 1e9
}

function toTags(strings: readonly string[], keys: readonly number[], values: readonly number[]): Tags {
  if (keys.length === 0) return NO_TAGS
  const tags: { [key: string]: string } = {}
  for (let i = 0; i < keys.length; i++) tags[strings[keys[i]]] = strings[values[i]]
  return tags
}

function readNode(pbf: PbfReader, block: Block, onNode: NonNullable<OsmHandlers['node']>): void {
  const end = pbf.readVarint() + pbf.pos
  let id = 0
  let lat = 0
  let lon = 0
  const keys: number[] = []
  const values: number[] = []
  for (let field; (field = pbf.nextField(end)); ) {
    if (field === 1) id = pbf.readSVarint()
    else if (field === 2) pbf.readPackedVarint(keys)
    else if (field === 3) pbf.readPackedVarint(values)
    else if (field === 8) lat = pbf.readSVarint()
    else if (field === 9) lon = pbf.readSVarint()
  }
  onNode(
    id,
    toDegrees(block, block.latOffset, lat),
    toDegrees(block, block.lonOffset, lon),
    toTags(block.strings, keys, values),
  )
}

function readDenseNodes(pbf: PbfReader, block: Block, onNode: NonNullable<OsmHandlers['node']>): void {
  const end = pbf.readVarint() + pbf.pos
  const ids: number[] = []
  const lats: number[] = []
  const lons: number[] = []
  const keysValues: number[] = []
  for (let field; (field = pbf.nextField(end)); ) {
    if (field === 1) pbf.readPackedSVarint(ids)
    else if (field === 8) pbf.readPackedSVarint(lats)
    else if (field === 9) pbf.readPackedSVarint(lons)
    else if (field === 10) pbf.readPackedVarint(keysValues)
  }
  // Ids and coordinates are stored as differences from the previous node.
  let id = 0
  let lat = 0
  let lon = 0
  let next = 0
  for (let i = 0; i < ids.length; i++) {
    id += ids[i]
    lat += lats[i]
    lon += lons[i]
    let tags = NO_TAGS
    // Each node's tags are key and value string indexes in turn, ended by a 0.
    if (next < keysValues.length && keysValues[next] !== 0) {
      const own: { [key: string]: string } = {}
      while (keysValues[next] !== 0) {
        own[block.strings[keysValues[next]]] = block.strings[keysValues[next + 1]]
        next += 2
      }
      tags = own
    }
    next++
    onNode(id, toDegrees(block, block.latOffset, lat), toDegrees(block, block.lonOffset, lon), tags)
  }
}

function readWay(pbf: PbfReader, block: Block, onWay: NonNullable<OsmHandlers['way']>): void {
  const end = pbf.readVarint() + pbf.pos
  let id = 0
  const keys: number[] = []
  const values: number[] = []
  const deltas: number[] = []
  for (let field; (field = pbf.nextField(end)); ) {
    if (field === 1) id = pbf.readVarint()
    else if (field === 2) pbf.readPackedVarint(keys)
    else if (field === 3) pbf.readPackedVarint(values)
    else if (field === 8) pbf.readPackedSVarint(deltas)
  }
  const refs: number[] = []
  let ref = 0
  for (const delta of deltas) refs.push((ref += delta))
  onWay(id, refs, toTags(block.strings, keys, values))
}

function readRelation(pbf: PbfReader, block: Block, onRelation: NonNullable<OsmHandlers['relation']>): void {
  const end = pbf.readVarint() + pbf.pos
  let id = 0
  const keys: number[] = []
  const values: number[] = []
  const roles: number[] = []
  const idDeltas: number[] = []
  const types: number[] = []
  for (let field; (field = pbf.nextField(end)); ) {
    if (field === 1) id = pbf.readVarint()
    else if (field === 2) pbf.readPackedVarint(keys)
    else if (field === 3) pbf.readPackedVarint(values)
    else if (field === 8) pbf.readPackedVarint(roles)
    else if (field === 9) pbf.readPackedSVarint(idDeltas)
    else if (field === 10) pbf.readPackedVarint(types)
  }
  const members: Member[] = []
  let memberId = 0
  for (let i = 0; i < idDeltas.length; i++) {
    memberId += idDeltas[i]
    members.push({ type: MEMBER_TYPES[types[i]], id: memberId, role: block.strings[roles[i]] })
  }
  onRelation(id, members, toTags(block.strings, keys, values))
}
