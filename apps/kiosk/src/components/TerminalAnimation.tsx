import { Nfc } from 'lucide-react';

/** Animated card approaching a payment terminal. Purely decorative. */
export function TerminalAnimation() {
  return (
    <div className="relative mx-auto h-[520px] w-[520px]" aria-hidden>
      {/* Terminal */}
      <div className="absolute bottom-0 left-1/2 h-[330px] w-[250px] -translate-x-1/2 rounded-[2.5rem] bg-ink p-5 shadow-2xl">
        <div className="flex h-[120px] items-center justify-center rounded-2xl bg-brand-soft">
          <Nfc className="terminal-waves size-20 text-brand" strokeWidth={2} />
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3 px-3">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="h-7 rounded-md bg-white/25" />
          ))}
        </div>
      </div>
      {/* Card */}
      <div className="card-tap absolute top-6 left-1/2 h-[170px] w-[270px] rounded-3xl bg-gradient-to-br from-accent to-brand shadow-xl">
        <span className="absolute top-8 left-7 h-9 w-12 rounded-md bg-white/70" />
        <span className="absolute right-7 bottom-8 left-7 h-3 rounded bg-white/45" />
        <span className="absolute bottom-14 left-7 h-3 w-24 rounded bg-white/45" />
      </div>
    </div>
  );
}
