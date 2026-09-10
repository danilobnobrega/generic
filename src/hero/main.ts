import './hero.css'
import { ShaderHero } from './ShaderHero'
import { mountCookieBanner } from '../ui/cookieBanner'

const canvas = document.querySelector<HTMLCanvasElement>('#webgl')
if (!canvas) throw new Error('no #webgl canvas')

// `npm run dev:spin` runs vite --mode spin (loads .env.spin) -> cubes keep
// spinning; plain `npm run dev` -> 90° cap
const spinMode = import.meta.env.VITE_HERO_MODE === 'spin' ? 'free' : 'cap'
console.info('[hero] spinMode:', spinMode)

const hero = new ShaderHero(canvas, { crumbScale: 2, spinMode })
mountCookieBanner(hero.crumbs, () => hero.unlock())
