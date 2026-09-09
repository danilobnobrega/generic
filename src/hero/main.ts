import './hero.css'
import { ShaderHero } from './ShaderHero'
import { mountCookieBanner } from '../ui/cookieBanner'

const canvas = document.querySelector<HTMLCanvasElement>('#webgl')
if (!canvas) throw new Error('no #webgl canvas')

const hero = new ShaderHero(canvas, { crumbScale: 2 })
mountCookieBanner(hero.crumbs)
