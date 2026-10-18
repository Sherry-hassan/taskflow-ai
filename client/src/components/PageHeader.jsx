import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import Avatar from './Avatar.jsx';
import { MenuIcon } from './icons.jsx';

// `breadcrumbs` is an array of { label, to? } — the last entry (current
// page) is rendered without a link. `title` is the large page heading; kept
// as a real <h1>/<h2> (via `as`) so existing Playwright specs that assert
// `getByRole('heading', { name: ... })` against the workspace/project name
// keep matching.
export default function PageHeader({ breadcrumbs = [], title, as: Heading = 'h1', actions, onOpenMenu }) {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur-sm">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation"
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
        >
          <MenuIcon className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1">
          {breadcrumbs.length > 0 && (
            <nav aria-label="Breadcrumb" className="mb-0.5 hidden truncate text-xs text-slate-500 sm:block">
              {breadcrumbs.map((crumb, index) => (
                <Fragment key={`${crumb.label}-${index}`}>
                  {index > 0 && <span className="px-1.5">/</span>}
                  {crumb.to ? (
                    <Link to={crumb.to} className="hover:text-slate-700">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-slate-700">{crumb.label}</span>
                  )}
                </Fragment>
              ))}
            </nav>
          )}
          <Heading className="truncate text-lg font-semibold text-slate-900">{title}</Heading>
        </div>

        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}

        <HeaderAvatar />
      </div>
    </header>
  );
}

function HeaderAvatar() {
  const { user } = useAuth();
  return <Avatar email={user?.email} size="md" className="shrink-0" />;
}
