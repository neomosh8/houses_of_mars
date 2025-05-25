export function checkPrerequisite(pr, playerEmail, institutionDataMap) {
  if (!pr) return false;
  if (pr.type === 'hire') {
    return Object.values(institutionDataMap).some(d =>
      d.owner === playerEmail && Array.isArray(d.workforce) && d.workforce.some(w => w.role === pr.value)
    );
  }
  if (pr.type === 'institution') {
    return Object.values(institutionDataMap).some(d => d.owner === playerEmail && d.name === pr.value);
  }
  return false;
}

export function renderProposals(container, proposals, instId, institutionDataMap, playerEmail, history = []) {
  container.innerHTML = '';
  if (!proposals || proposals.length === 0) {
    container.innerHTML = '<div style="color:#fff">No proposals</div>';
  } else {

    proposals.forEach((p, idx) => {
    const card = document.createElement('div');
    card.style.border = '1px solid #888';
    card.style.padding = '8px';
    card.style.marginBottom = '6px';

    const title = document.createElement('div');
    title.textContent = p.project || p.title || 'Project';
    title.style.fontWeight = 'bold';
    card.appendChild(title);

    if (p.description) {
      const desc = document.createElement('div');
      desc.textContent = p.description;
      card.appendChild(desc);
    }
    const meta = document.createElement('div');
    meta.style.fontSize = '12px';
    const parts = [];
    if (p.cost) parts.push(`Cost: $${p.cost}`);
    if (p.gains) {
      const gainParts = [];
      for (const [k, v] of Object.entries(p.gains)) {
        if (Array.isArray(v)) gainParts.push(`${k} ${v[0]}-${v[1]}`);
        else gainParts.push(`${k} ${v}`);
      }
      if (gainParts.length) parts.push('Gain: ' + gainParts.join(', '));
    }
    if (p.risk) parts.push(`Risk: ${p.risk}`);
    if (parts.length) meta.textContent = parts.join(' | ');
    if (meta.textContent) card.appendChild(meta);

    const table = document.createElement('table');
    const prereqs = Array.isArray(p.prerequisites) ? p.prerequisites : [];
    prereqs.forEach(pr => {
      const row = document.createElement('tr');
      const name = document.createElement('td');
      name.textContent = `${pr.type}: ${pr.value}`;
      const action = document.createElement('td');
      const btn = document.createElement('button');
      btn.textContent = 'Check';
      btn.onclick = () => {
        const ok = checkPrerequisite(pr, playerEmail, institutionDataMap);
        btn.textContent = ok ? 'Done' : 'Not Found';
        btn.disabled = true;
        checkReady();
      };
      row.appendChild(name);
      row.appendChild(action);
      action.appendChild(btn);
      table.appendChild(row);
    });
    card.appendChild(table);
    // enable approval if there are no prerequisites
    if (prereqs.length === 0) {
      setTimeout(checkReady, 0);
    }
    const approve = document.createElement('button');
    approve.textContent = 'Approve';
    approve.disabled = true;
    const deny = document.createElement('button');
    deny.textContent = 'Deny';
    const statusDiv = document.createElement('div');
    statusDiv.style.marginTop = '4px';
    statusDiv.style.fontSize = '12px';

    function checkReady() {
      const all = [...table.querySelectorAll('button')].every(b => b.disabled);
      if (all) approve.disabled = false;
    }

    approve.onclick = async () => {
      approve.disabled = true;
      deny.disabled = true;
      approve.textContent = 'Loading...';
      const res = await fetch(`/api/workforce/proposals/${instId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: idx, approve: true })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.result && data.result.gains) {
          const inst = institutionDataMap[instId];
          if (inst) {
            inst.extraEffects = inst.extraEffects || {};
            Object.assign(inst.extraEffects, data.result.gains);
            if (inst.owner === playerEmail) {
              ownedInstitutions.push(data.result.gains);
            }
          }
        }
        if (data.result && data.result.feasible) {
          approve.textContent = 'Started';
          approve.style.backgroundColor = '#0a0';
          statusDiv.textContent = 'Status: approved';
        } else {
          approve.textContent = 'Project failed';
          approve.style.backgroundColor = '#a00';
          statusDiv.textContent = 'Status: rejected';
        }
      } else {
        approve.textContent = 'Error';
        approve.style.backgroundColor = '#a00';
      }
    };

    deny.onclick = async () => {
      await fetch(`/api/workforce/proposals/${instId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: idx, approve: false })
      });
      card.remove();
    };

    card.appendChild(approve);
    card.appendChild(deny);
    card.appendChild(statusDiv);
    container.appendChild(card);
  });
  }

  if (history && history.length > 0) {
    const header = document.createElement('div');
    header.style.marginTop = '10px';
    header.style.color = '#fff';
    header.textContent = 'Past Proposals';
    container.appendChild(header);
    history.forEach(p => {
      const card = document.createElement('div');
      card.style.border = '1px solid #444';
      card.style.padding = '6px';
      card.style.marginBottom = '4px';
      const title = document.createElement('div');
      title.textContent = p.project;
      title.style.fontWeight = 'bold';
      card.appendChild(title);
      const status = document.createElement('div');
      status.textContent = `Status: ${p.status}`;
      card.appendChild(status);
      if (p.judgeResult && !p.judgeResult.feasible) {
        const note = document.createElement('div');
        note.textContent = p.judgeResult.gains;
        card.appendChild(note);
      }
      container.appendChild(card);
    });
  }
}
