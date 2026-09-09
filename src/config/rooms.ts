import type { Experience } from '../Experience/Experience'
import type { Room } from '../Experience/World/Room'

export interface RoomDef {
  path: string
  name: string
  tag: string
  /** accent that infects the cursor + this room's door on the hero */
  accent: string
  /** clear colour for the room's scene */
  background: string
  /** true when the room's ground is dark (flips overlay copy contrast) */
  dark: boolean
  /** the one word under the cursor in this room */
  cursor: string
  /** the real copy this room is built from */
  copy: string
  /** minimum time the Loader is shown, ms — deadpan padding */
  minLoad: number
  /** where the door sits on the hero sheet, in sheet units (x: -8..8, y: -5..5) */
  door: [number, number]
  /** route-split module loader */
  load: () => Promise<{ default: RoomConstructor }>
}

export type RoomConstructor = new (exp: Experience, def: RoomDef) => Room

const placeholder = () => import('../Experience/World/rooms/PlaceholderRoom')

export const ROOMS: Record<string, RoomDef> = {
  '/': {
    path: '/',
    name: 'GENERIC',
    tag: 'the blank page',
    accent: '#14150f',
    background: '#f2f1ec',
    dark: false,
    cursor: 'pick one',
    copy: 'We do things for people.',
    minLoad: 300,
    door: [0, 0],
    load: () => import('../Experience/World/rooms/HeroRoom'),
  },

  '/services': {
    path: '/services',
    name: 'Services',
    tag: 'the spinning logo',
    accent: '#8a929c',
    background: '#f4f4f2',
    dark: false,
    cursor: 'drag to spin',
    copy: 'We make software for people who need software. We write words that computer understand so your computer does the thing.',
    minLoad: 500,
    door: [-5.4, -1.6],
    load: placeholder,
  },

  '/faq': {
    path: '/faq',
    name: 'FAQ',
    tag: 'the accordion',
    accent: '#c0392b',
    background: '#f3e9e7',
    dark: false,
    cursor: 'pull',
    copy: 'Q: What is your stack? A: Code. Q: Do you use Agile or Waterfall? A: We work on it until it is finished.',
    minLoad: 500,
    door: [5.6, 2.2],
    load: placeholder,
  },

  '/case-studies': {
    path: '/case-studies',
    name: 'Case Studies',
    tag: 'the observatory',
    accent: '#6f8fd6',
    background: '#080b16',
    dark: true,
    cursor: 'telescope',
    copy: 'Client X had a problem. We made a solution. Client X made money. End of study.',
    minLoad: 550,
    door: [2.4, -3.1],
    load: placeholder,
  },

  '/social-proof': {
    path: '/social-proof',
    name: 'Social Proof',
    tag: 'the logo pile',
    accent: '#0057b8',
    background: '#eef1f4',
    dark: false,
    cursor: 'grab',
    copy: 'Trusted by Companies: A Company. Another Company. A Third, Slightly Larger Company. "I gave them money. The software functions." — John, Person.',
    minLoad: 500,
    door: [-3.1, 1.6],
    load: placeholder,
  },

  '/pitch-deck': {
    path: '/pitch-deck',
    name: 'Pitch Deck',
    tag: 'the presentation',
    accent: '#fbbc04',
    background: '#1c1c1c',
    dark: true,
    cursor: 'laser pointer',
    copy: 'OUR SOFTWARE WORKS AND YOUR CURRENT SOFTWARE DOES NOT. (End of Presentation. Questions?)',
    minLoad: 550,
    door: [6.1, -0.8],
    load: placeholder,
  },

  '/process': {
    path: '/process',
    name: 'The Process',
    tag: 'the machine',
    accent: '#c8912f',
    background: '#151007',
    dark: true,
    cursor: 'a coin',
    copy: 'STEP 3: You give us half the money. STEP 4: We make the website look ridiculously good. If Step 3 does not happen, Step 4 will also not happen.',
    minLoad: 550,
    door: [-6.2, 0.2],
    load: placeholder,
  },

  '/team': {
    path: '/team',
    name: 'Team',
    tag: 'the busts',
    accent: '#b07a56',
    background: '#efe6df',
    dark: false,
    cursor: 'default',
    copy: 'CEO: a guy named Dave who owns a laptop. CTO: another guy who types faster than Dave. Lead Designer: complains about kerning. Head of HR: there is no HR.',
    minLoad: 500,
    door: [0, -2.6],
    load: placeholder,
  },

  '/terms': {
    path: '/terms',
    name: 'Terms & Scope',
    tag: 'the fine print',
    accent: '#e9e9e2',
    background: '#111111',
    dark: true,
    cursor: 'fountain pen',
    copy: 'What you think you signed: "Unlimited revisions." What you actually signed: 2 revisions. After that, we charge you for every breath we take in your presence.',
    minLoad: 550,
    door: [4.2, 3.4],
    load: placeholder,
  },

  '/checkout': {
    path: '/checkout',
    name: 'Checkout',
    tag: 'pay money / do not pay money',
    accent: '#635bff',
    background: '#0b0a12',
    dark: true,
    cursor: 'pay',
    copy: 'SUCCESS. You have successfully paid money. We have received the money. A invoice has been sent to your inbox. It contains numbers.',
    minLoad: 600,
    door: [0, 3.6],
    load: placeholder,
  },
}

export function resolveRoom(pathname: string): RoomDef {
  return ROOMS[pathname] ?? ROOMS['/']
}
