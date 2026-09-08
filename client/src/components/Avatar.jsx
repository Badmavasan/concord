export default function Avatar({ name, title, status }) {
  const initials = (name || '?').split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();
  const cls = 'avatar' + (status === 'submitted' ? ' done' : status === 'pending' ? ' idle' : '');
  return <span className={cls} title={title || name}>{initials}</span>;
}

export function Assignees({ paper }) {
  if (!paper.assignees.length) return <span className="muted small">Nobody yet</span>;
  return <span className="avatars">{paper.assignees.map(a => {
    const st = paper.annotations.find(x => x.user_id === a.id)?.status || 'pending';
    return <Avatar key={a.id} name={a.name} status={st} title={`${a.name}: ${st}`} />;
  })}</span>;
}
