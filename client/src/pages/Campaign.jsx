import { useCallback, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { api } from '../api.js';
import PapersTab from './tabs/PapersTab.jsx';
import FieldsTab from './tabs/FieldsTab.jsx';
import KanbanTab from './tabs/KanbanTab.jsx';
import MembersTab from './tabs/MembersTab.jsx';
import StatsTab from './tabs/StatsTab.jsx';
import SettingsTab from './tabs/SettingsTab.jsx';

export default function Campaign() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const reload = useCallback(() => api(`/campaigns/${id}`).then(setData).catch(e => setErr(e.message)), [id]);
  useEffect(() => { reload(); }, [reload]);

  if (err) return <div className="page"><div className="note red">{err}</div></div>;
  if (!data) return <div className="page muted">Loading</div>;
  const { campaign } = data;
  const owner = campaign.role === 'owner';
  const ctx = { ...data, owner, reload };

  return (
    <div className="shell">
      <aside className="spine">
        <h1>{campaign.name}</h1>
        {campaign.description && <div className="desc">{campaign.description}</div>}
        <nav>
          <NavLink to="papers">Papers</NavLink>
          <NavLink to="board">Board</NavLink>
          {owner && <NavLink to="fields">Criteria <span className="count">{data.fields.length}</span></NavLink>}
          <NavLink to="members">Team <span className="count">{data.members.length}</span></NavLink>
          {owner && <NavLink to="stats">Agreement</NavLink>}
          {owner && <NavLink to="settings">Settings</NavLink>}
        </nav>
        <div className="role">{owner ? 'You own this campaign.' : 'You annotate in this campaign.'}</div>
      </aside>
      <main className="content">
        <Routes>
          <Route index element={<Navigate to="papers" replace />} />
          <Route path="papers" element={<PapersTab {...ctx} />} />
          <Route path="board" element={<KanbanTab {...ctx} />} />
          <Route path="fields" element={owner ? <FieldsTab {...ctx} /> : <Navigate to="../papers" />} />
          <Route path="members" element={<MembersTab {...ctx} />} />
          <Route path="stats" element={owner ? <StatsTab {...ctx} /> : <Navigate to="../papers" />} />
          <Route path="settings" element={owner ? <SettingsTab {...ctx} /> : <Navigate to="../papers" />} />
        </Routes>
      </main>
    </div>
  );
}
