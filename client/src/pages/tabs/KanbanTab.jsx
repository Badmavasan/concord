import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { api } from '../../api.js';
import { Assignees } from '../../components/Avatar.jsx';

export default function KanbanTab({ campaign, stages, owner, reload }) {
  const [papers, setPapers] = useState(null);
  const [newStage, setNewStage] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const base = `/campaigns/${campaign.id}`;
  const load = () => api(`${base}/papers`).then(d => setPapers(d.papers));
  useEffect(() => { load(); }, [campaign.id]);
  if (!papers) return <div className="muted">Loading</div>;

  const byStage = Object.fromEntries(stages.map(s => [s.id, []]));
  for (const p of papers) if (!onlyMine || p.assigned_to_me) (byStage[p.stage_id] || byStage[stages[0]?.id])?.push(p);

  const onDragEnd = async ({ destination, draggableId }) => {
    if (!destination) return;
    const pid = Number(draggableId), toStage = Number(destination.droppableId);
    setPapers(ps => { const moving = ps.find(p => p.id === pid); const rest = ps.filter(p => p.id !== pid); const col = rest.filter(p => p.stage_id === toStage); col.splice(destination.index, 0, { ...moving, stage_id: toStage }); return [...rest.filter(p => p.stage_id !== toStage), ...col.map((p, i) => ({ ...p, position: i }))]; });
    try { await api(`${base}/papers/${pid}/move`, { method: 'POST', body: { stage_id: toStage, position: destination.index } }); } catch (e) { alert(e.message); load(); }
  };
  const addStage = async e => { e.preventDefault(); if (!newStage.trim()) return; await api(`${base}/stages`, { method: 'POST', body: { name: newStage } }); setNewStage(''); reload(); };
  const renameStage = async s => { const name = prompt('Rename stage', s.name); if (name && name !== s.name) { await api(`${base}/stages/${s.id}`, { method: 'PATCH', body: { name } }); reload(); } };
  const deleteStage = async s => { if (!confirm(`Delete "${s.name}"? Its papers move to the first stage.`)) return; await api(`${base}/stages/${s.id}`, { method: 'DELETE' }); reload(); load(); };
  const moveStage = async (i, dir) => { const order = stages.map(s => s.id); const j = i + dir; if (j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; await api(`${base}/stages/order`, { method: 'PUT', body: { order } }); reload(); };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="content-head">
        <div><h2>Board</h2><p className="hint">Drag papers between stages to track follow-up. Papers move forward on their own as annotations come in.</p></div>
        <div className="row">
          <label className="opt small"><input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} /> Only mine</label>
          {owner && <form className="row" onSubmit={addStage}><input type="text" placeholder="New stage" value={newStage} onChange={e => setNewStage(e.target.value)} style={{ width: 160 }} /><button className="btn sm">Add stage</button></form>}
        </div>
      </div>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="kanban">
          {stages.map((s, i) => (
            <div className="column" key={s.id}>
              <div className="column-head">
                <span>{s.name}<span className="n">{byStage[s.id].length}</span></span>
                {owner && <span className="tools">
                  <button className="btn quiet icon sm" title="Move left" onClick={() => moveStage(i, -1)} disabled={i === 0}>‹</button>
                  <button className="btn quiet icon sm" title="Move right" onClick={() => moveStage(i, 1)} disabled={i === stages.length - 1}>›</button>
                  <button className="btn quiet icon sm" title="Rename" onClick={() => renameStage(s)}>✎</button>
                  <button className="btn quiet icon sm danger" title="Delete" onClick={() => deleteStage(s)}>✕</button>
                </span>}
              </div>
              <Droppable droppableId={String(s.id)}>
                {(prov, snap) => (
                  <div ref={prov.innerRef} {...prov.droppableProps} className={'column-body' + (snap.isDraggingOver ? ' over' : '')}>
                    {byStage[s.id].map((p, idx) => (
                      <Draggable key={p.id} draggableId={String(p.id)} index={idx}>
                        {(dp, ds) => (
                          <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps} className={'kcard' + (ds.isDragging ? ' dragging' : '')}>
                            <Link className="title" to={`../papers/${p.id}`}>{p.title}</Link>
                            <div className="muted">{[p.authors?.split(';')[0]?.trim(), p.year].filter(Boolean).join(', ')}</div>
                            <div className="foot">
                              <Assignees paper={p} />
                              <span className="row" style={{ gap: 4 }}>
                                {!p.has_pdf && <span className="tag danger">No PDF</span>}
                                {p.assignees.length > 0 && <span className={'tag ' + (p.submitted_count === p.assignees.length ? 'ok' : p.submitted_count ? 'warn' : '')}>{p.submitted_count}/{p.assignees.length}</span>}
                              </span>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {prov.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
