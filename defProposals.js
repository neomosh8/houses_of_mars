export function renderDefProposals(container, proposals, instId) {
  container.innerHTML = '';
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

    approve.onclick = async () => {
      approve.disabled = true;
      deny.disabled = true;
      approve.textContent = 'Loading...';
      const res = await fetch(`/api/defence/proposals/${instId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: idx, approve: true })
      });
      if (res.ok) {
        approve.textContent = 'Started';
        approve.style.backgroundColor = '#0a0';
        statusDiv.textContent = 'Status: approved';
      } else {
        approve.textContent = 'Error';
        approve.style.backgroundColor = '#a00';
      }
    };

    deny.onclick = async () => {
      approve.disabled = true;
      deny.disabled = true;
      const res = await fetch(`/api/defence/proposals/${instId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: idx, approve: false })
      });
      if (res.ok) {
        statusDiv.textContent = 'Status: denied';
        approve.style.display = 'none';
        deny.style.display = 'none';
      } else {
        deny.textContent = 'Error';
      }
    };

    card.appendChild(approve);
    card.appendChild(deny);
    card.appendChild(statusDiv);
    container.appendChild(card);
  });
}
