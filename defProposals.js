export function renderDefProposals(
  container,
  proposals,
  instId,
  institutionDataMap,
  playerEmail
) {
  container.innerHTML = '';
  console.log('[DEFENCE UI] renderDefProposals', { instId, count: proposals ? proposals.length : 0 });
  if (!Array.isArray(proposals) || proposals.length === 0) {
    container.innerHTML = '<div style="color:#fff">No proposals</div>';
    return;
  }
  proposals.forEach((p, idx) => {
    const card = document.createElement('div');
    card.style.border = '1px solid #888';
    card.style.padding = '8px';
    card.style.marginBottom = '6px';

    const title = document.createElement('div');
    title.textContent = p.name || 'Weapon';
    title.style.fontWeight = 'bold';
    card.appendChild(title);

    const info = document.createElement('div');
    const params = p.parameters || {};
    const tech = Array.isArray(p.technology) ? p.technology.join(', ') : (p.technology || '');
    info.innerHTML =
      `Category: ${p.category || ''}<br>` +
      `Technology: ${tech}<br>` +
      `Weight ${params.weight || 0}, Ammo ${params.ammo || 0}, ` +
      `Force ${params.force || 0}, Fuel ${params.fuel || 0}<br>` +
      `Look: ${p.look || ''}`;
    card.appendChild(info);

    const approve = document.createElement('button');
    approve.textContent = 'Approve';
    const deny = document.createElement('button');
    deny.textContent = 'Deny';
    const statusDiv = document.createElement('div');
    statusDiv.style.marginTop = '4px';
    statusDiv.style.fontSize = '12px';
    const votesDiv = document.createElement('div');
    votesDiv.style.fontSize = '12px';
    votesDiv.style.marginTop = '4px';
    const votes = p.votes || {};
    const instShares = institutionDataMap[instId] && institutionDataMap[instId].shares || {};
    let approveCount = 0;
    let denyCount = 0;
    Object.entries(votes).forEach(([em,v]) => { const s = instShares[em] || 0; if(v) approveCount += s; else denyCount += s; });
    votesDiv.textContent = `Approvals: ${approveCount}, Denials: ${denyCount}`;
    if (votes[playerEmail] !== undefined) { approve.disabled = true; deny.disabled = true; }

    approve.onclick = async () => {
      approve.disabled = true;
      deny.disabled = true;
      approve.textContent = 'Loading...';
      const res = await fetch(`/api/defence/proposals/${instId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: idx, approve: true, email: playerEmail })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status && data.status !== 'pending') {
          statusDiv.textContent = 'Status: ' + data.status;
            const cat = (p.category || '').toLowerCase();
            if (data.status === 'approved' && (cat === 'defence' || cat === 'defense')) {
            const buildings = Object.values(institutionDataMap).filter(b => b.shares && b.shares[playerEmail] > 0 && !b.destroyed);
            window.showPatriotPopup(buildings, async ids => {
              if (ids.length) {
                await fetch('/api/defence/patriots', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ buildingIds: ids, name: p.name, parameters: p.parameters })
                });
              }
            });
          }
        } else {
          votesDiv.textContent = `Approvals: ${data.votes.approve}, Denials: ${data.votes.deny}`;
          approve.textContent = 'Vote sent';
        }
      }
    };

    deny.onclick = async () => {
      approve.disabled = true;
      deny.disabled = true;
      const res = await fetch(`/api/defence/proposals/${instId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: idx, approve: false, email: playerEmail })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status && data.status !== 'pending') {
          statusDiv.textContent = 'Status: ' + data.status;
        } else {
          votesDiv.textContent = `Approvals: ${data.votes.approve}, Denials: ${data.votes.deny}`;
          deny.textContent = 'Vote sent';
        }
      }
    };

    card.appendChild(approve);
    card.appendChild(deny);
    card.appendChild(statusDiv);
    card.appendChild(votesDiv);
    container.appendChild(card);
  });
}
