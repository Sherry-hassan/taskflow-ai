import { Link } from 'react-router-dom';

// Shared split-screen shell for every auth page (login, signup, forgot/reset
// password). Left brand panel is decorative only and hidden on small
// screens; the right panel carries the actual form so mobile stays a single
// focused column.
export default function AuthLayout({ heading, subtitle, children }) {
  return (
    <div className="flex min-h-screen bg-white">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-slate-950 p-12 text-white lg:flex">
        <Link to="/login" className="text-lg font-semibold tracking-tight">
          TaskFlow <span className="text-indigo-400">AI</span>
        </Link>

        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Turn your ideas into actionable plans.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            Plan projects, track progress, and let AI turn scattered ideas into
            structured, achievable tasks for your whole team.
          </p>

          <div className="mt-10 rounded-xl border border-white/10 bg-white/5 p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">Launch Roadmap</span>
              <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[11px] font-medium text-indigo-300">
                On track
              </span>
            </div>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-2/3 rounded-full bg-indigo-400" />
            </div>
            <ul className="mt-5 space-y-2.5">
              <li className="flex items-center gap-2.5 text-sm text-slate-200">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-500/80 text-[10px]">
                  ✓
                </span>
                Define project scope
              </li>
              <li className="flex items-center gap-2.5 text-sm text-slate-200">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-500/80 text-[10px]">
                  ✓
                </span>
                AI-generated task breakdown
              </li>
              <li className="flex items-center gap-2.5 text-sm text-slate-400">
                <span className="h-4 w-4 shrink-0 rounded-full border border-white/20" />
                Team review &amp; sign-off
              </li>
            </ul>
          </div>
        </div>

        <p className="text-xs text-slate-500">&copy; {new Date().getFullYear()} TaskFlow AI</p>
      </div>

      <div className="flex w-full flex-col items-center justify-center bg-white px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm">
          <Link to="/login" className="mb-8 block text-lg font-semibold tracking-tight text-slate-900 lg:hidden">
            TaskFlow <span className="text-indigo-600">AI</span>
          </Link>

          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{heading}</h1>
          {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}

          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
