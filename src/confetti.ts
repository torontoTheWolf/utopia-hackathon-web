const GOLDS = ['#ffd60a', '#ffc300', '#f4b400', '#e0a100', '#ffe066', '#c9971c']
const COUNT = 90
const GRAVITY = 1500
// Air resistance: confetti falls at no more than GRAVITY / DRAG px a second, and flutters on the way down.
const DRAG = 4
const STEP = 1 / 30
const MAX_SECONDS = 4

// Bursts gold confetti up out of the top edge of `container` and lets it fall past the bottom of the screen. The
// container must not clip what overflows it. Nothing happens for people who ask for reduced motion.
export function burstConfetti(container: HTMLElement): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const box = container.getBoundingClientRect()
  const floor = innerHeight - box.top + 20
  for (let i = 0; i < COUNT; i++) {
    const piece = document.createElement('span')
    piece.className = 'confetti-piece'
    piece.style.width = `${6 + Math.random() * 4}px`
    piece.style.height = `${10 + Math.random() * 6}px`
    piece.style.background = GOLDS[i % GOLDS.length]
    if (Math.random() < 0.2) piece.style.borderRadius = '50%'
    container.append(piece)
    const frames = flight(box.width, floor)
    piece.animate(frames, { duration: frames.length * STEP * 1000, easing: 'linear', fill: 'forwards' }).onfinish = () => piece.remove()
  }
}

// One piece's path, a keyframe every STEP seconds: up and out at a random angle, then falling, spinning and swaying.
function flight(width: number, floor: number): Keyframe[] {
  const angle = ((-90 + (Math.random() - 0.5) * 120) * Math.PI) / 180
  const speed = 500 + Math.random() * 600
  let x = (Math.random() - 0.5) * width * 0.8
  let y = 0
  let vx = Math.cos(angle) * speed
  let vy = Math.sin(angle) * speed
  const spin = (Math.random() - 0.5) * 1440
  const flip = 360 + Math.random() * 720
  const sway = 20 + Math.random() * 30
  const swayRate = 3 + Math.random() * 4
  const frames: Keyframe[] = []
  for (let t = 0; t < MAX_SECONDS && y < floor; t += STEP) {
    const dx = Math.sin(t * swayRate) * sway * Math.min(1, t)
    frames.push({ transform: `translate(${x + dx}px, ${y}px) rotate(${spin * t}deg) rotateX(${flip * t}deg)` })
    vy += GRAVITY * STEP
    vx -= vx * DRAG * STEP
    vy -= vy * DRAG * STEP
    x += vx * STEP
    y += vy * STEP
  }
  // Fades out over the last quarter, in case it ends still on screen.
  const fadeFrom = frames.length * 0.75
  return frames.map((frame, index) => ({ ...frame, opacity: index < fadeFrom ? 1 : 1 - (index - fadeFrom) / (frames.length - fadeFrom) }))
}
