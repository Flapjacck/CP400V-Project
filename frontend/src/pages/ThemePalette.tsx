// Theme palette page: shows every Press token so pages stay consistent.
import Logo from '../components/Logo'

// Class names are written out in full so Tailwind can find them at build time
const colours = [
  { name: 'paper', hex: '#F3EEE4', rgb: '243, 238, 228', use: 'Page background', cls: 'bg-paper' },
  { name: 'card', hex: '#FFFFFF', rgb: '255, 255, 255', use: 'Cards', cls: 'bg-card' },
  { name: 'ink', hex: '#111111', rgb: '17, 17, 17', use: 'Text and rules', cls: 'bg-ink' },
  { name: 'muted', hex: '#6E675C', rgb: '110, 103, 92', use: 'Muted text', cls: 'bg-muted' },
  { name: 'rule', hex: '#D8D0C0', rgb: '216, 208, 192', use: 'Hairlines, unplayed wave', cls: 'bg-rule' },
  { name: 'signal', hex: '#2D3CFF', rgb: '45, 60, 255', use: 'Primary actions', cls: 'bg-signal' },
  { name: 'hook', hex: '#E4FF3A', rgb: '228, 255, 58', use: 'The hook highlight', cls: 'bg-hook' },
  { name: 'alert', hex: '#FF5A1F', rgb: '255, 90, 31', use: 'Movers and alerts', cls: 'bg-alert' },
]

const ticker = [
  'Now hooking: Basement Summer by KAYLO',
  'Juno & the Static enter at #3',
  'mira.wav climbs 7 spots',
  'Upload your track and pick your hook',
]

// Fixed bar heights keep the sample waveform stable between renders
const bars = [8, 14, 22, 12, 28, 18, 34, 26, 16, 30, 38, 24, 36, 40, 28, 20, 32, 14, 24, 18, 10, 16, 22, 12, 8, 14]
const hookStart = 10
const hookEnd = 16

export default function ThemePalette() {
  return (
    <main className="mx-auto max-w-6xl px-8 pb-24">
      <header className="flex items-end justify-between border-b-4 border-ink pt-10 pb-4">
        <h1 className="text-8xl leading-none italic">Hookd</h1>
        <div className="text-right">
          <p className="label">Theme sheet</p>
          <p className="text-sm text-muted">Press · v1</p>
        </div>
      </header>

      <div className="overflow-hidden border-b border-ink bg-ink py-2 text-sm font-bold whitespace-nowrap text-paper">
        {ticker.map((t) => (
          <span key={t} className="mx-4">
            <span className="text-hook">✦</span> {t}
          </span>
        ))}
      </div>

      <section className="mt-12">
        <p className="label mb-4">Colours</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {colours.map((c) => (
            <div key={c.name} className="rounded-xl border border-rule bg-card p-3">
              <div className={`h-20 rounded-lg border border-rule ${c.cls}`} />
              <p className="mt-3 font-bold">{c.name}</p>
              <p className="text-sm text-muted">{c.use}</p>
              <p className="mt-1 font-mono text-xs text-muted">{c.hex}</p>
              <p className="font-mono text-xs text-muted">rgb({c.rgb})</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-rule bg-card p-6">
          <p className="label mb-3 text-muted">font-serif · Instrument Serif</p>
          <p className="font-serif text-6xl leading-none">
            <i>Hookd</i> Weekly
          </p>
          <p className="mt-3 font-serif text-3xl">The best fifteen seconds of every track.</p>
          <p className="mt-3 text-sm text-muted">Masthead and headlines. Weights 400 and 400 italic.</p>
        </div>
        <div className="rounded-xl border border-rule bg-card p-6">
          <p className="label mb-3 text-muted">font-sans · Inter Tight</p>
          <p className="text-4xl font-extrabold tracking-tight">Rank, play, follow</p>
          <p className="mt-3 text-lg font-medium">
            Body, charts and UI. The <span className="hook-mark">hook</span> gets the highlighter.
          </p>
          <p className="mt-3 text-sm text-muted">Weights 400, 500, 700 and 800.</p>
        </div>
      </section>

      <section className="mt-14 border-t-4 border-ink pt-6">
        <p className="label mb-4">Hook of the week</p>
        <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
          <div>
            <h2 className="text-5xl">Basement Summer</h2>
            <p className="mt-1 text-muted">KAYLO · #rnb · 31.2K plays</p>
            <div className="mt-6 flex h-10 items-center gap-0.75">
              {bars.map((h, i) => (
                <span
                  key={i}
                  style={{ height: h }}
                  className={`w-1.5 rounded-full ${i >= hookStart && i < hookEnd ? 'bg-signal' : i < hookStart ? 'bg-ink' : 'bg-rule'}`}
                />
              ))}
            </div>
            <p className="mt-3 text-sm">
              <span className="hook-mark font-bold">The hook · 1:40 to 1:55</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="rounded-full bg-signal px-5 py-2.5 font-bold text-white hover:bg-ink">▶ Play the hook</button>
            <button className="rounded-full border-2 border-ink px-5 py-2.5 font-bold hover:bg-ink hover:text-paper">Follow</button>
            <span className="rounded-full bg-alert px-3 py-2.5 text-sm font-bold text-white">▲ 3</span>
          </div>
        </div>
      </section>

      <footer className="mt-16 flex items-center gap-2 border-t border-rule pt-4 text-sm text-muted">
        <Logo className="h-5 w-4 text-ink" /> Tokens live in src/styles/theme.css under @theme.
      </footer>
    </main>
  )
}
