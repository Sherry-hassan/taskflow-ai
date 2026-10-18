// No `name` field exists on the User model (server/src/models/User.js) — only
// email — so initials are always derived from the email's local part. Purely
// a presentational convenience; never used for any identity/authorization
// decision.
function initialsFromEmail(email) {
  if (!email) {
    return '?';
  }
  const local = email.split('@')[0];
  return local.slice(0, 2).toUpperCase();
}

const sizeClasses = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
};

export default function Avatar({ email, size = 'md', className = '' }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700 ${sizeClasses[size]} ${className}`}
      title={email || 'Unassigned'}
    >
      {initialsFromEmail(email)}
    </span>
  );
}
