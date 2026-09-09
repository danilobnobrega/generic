import './style.css'
import { Experience } from './Experience/Experience'

const canvas = document.querySelector<HTMLCanvasElement>('#webgl')
if (!canvas) throw new Error('No #webgl canvas. It broke. We will fix it so it stops breaking.')

new Experience(canvas)
