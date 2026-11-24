// 面向正式知识图谱网站的 D3 交互原型：支持缩放、拖拽、搜索、类型筛选、详情面板与视图重置
(async function () {
  let raw;
  try {
    const resp = await fetch('./data/graph_mingqing_catalog.json');
    if (!resp.ok) throw new Error(`数据文件加载失败：${resp.status}`);
    raw = await resp.json();
  } catch (error) {
    const graph = document.getElementById('graph');
    graph.innerHTML = '<div class="load-error"><strong>图谱数据无法加载</strong><span>请通过本地 HTTP 服务打开此页面，不要直接双击 HTML 文件。</span><code>python -m http.server 8000</code></div>';
    console.error('Knowledge graph data failed to load:', error);
    return;
  }

  const data = buildGraph(raw.catalog || []);

  function buildGraph(catalog) {
    const nodes = [];
    const edges = [];
    const ids = new Map();
    let nextId = 1;

    function addNode(label, type, fields = {}) {
      const key = `${type}:${label}`;
      if (ids.has(key)) return ids.get(key);
      const node = { id: nextId++, label, type, ...fields };
      ids.set(key, node.id);
      nodes.push(node);
      return node.id;
    }

    function addEdge(from, to, label) {
      edges.push({ from, to, label });
    }

    catalog.forEach((item) => {
      const workId = addNode(item.title, '作品', {
        author: item.author,
        period: item.period,
        setting: item.setting,
        level: item.level,
        genre: item.genre,
        edition: item.edition,
        desc: item.desc
      });
      const authorId = addNode(item.author, '作者');
      addEdge(workId, authorId, '作者');

      item.people.forEach((person) => {
        addEdge(addNode(person, '人物'), workId, '属于');
      });
      item.themes.forEach((theme) => {
        addEdge(workId, addNode(theme, '主题'), '包含主题');
      });
      addEdge(workId, addNode(item.period, '时代'), '成书时代');
      addEdge(workId, addNode(item.setting, '时代'), '叙事时代');
    });

    return { nodes, links: edges.map((edge) => ({ source: edge.from, target: edge.to, label: edge.label })) };
  }

  const container = document.getElementById('graph');
  const width = container.clientWidth || 1100;
  const height = container.clientHeight || 720;

  const svg = d3.select('#graph').append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  const defs = svg.append('defs');
  defs.append('marker')
    .attr('id', 'arrow')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 18)
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', '#7c8aa0');

  const g = svg.append('g').attr('class', 'graph-root');
  const zoneGroup = g.append('g').attr('class', 'zone-layer');
  const linkGroup = g.append('g').attr('class', 'link-layer');
  const nodeGroup = g.append('g').attr('class', 'node-layer');

  const zoom = d3.zoom()
    .scaleExtent([0.45, 2.4])
    .on('zoom', (event) => g.attr('transform', event.transform));

  svg.call(zoom);

  const nodeSizeInput = document.getElementById('node-size');
  const clusterInput = document.getElementById('cluster-spacing');
  const searchInput = document.getElementById('search');
  const filters = document.getElementById('filters');
  const statNodes = document.getElementById('stat-nodes');
  const statLinks = document.getElementById('stat-links');
  const statTypes = document.getElementById('stat-types');

  const clusterZones = [
    { key: '入门区', x: 160, y: 120, width: 1180, height: 670, left: 300, top: 250, columns: 5, cellWidth: 220, cellHeight: 220 },
    { key: '进阶A', x: 1410, y: 120, width: 980, height: 670, left: 1530, top: 250, columns: 3, cellWidth: 285, cellHeight: 230 },
    { key: '进阶B', x: 160, y: 850, width: 1380, height: 760, left: 300, top: 990, columns: 7, cellWidth: 185, cellHeight: 225 },
    { key: '深度区', x: 1600, y: 850, width: 790, height: 760, left: 1710, top: 990, columns: 3, cellWidth: 300, cellHeight: 245 }
  ];

  zoneGroup.selectAll('g.zone')
    .data(clusterZones)
    .enter()
    .append('g')
    .attr('class', 'zone')
    .each(function (zone) {
      const zoneSelection = d3.select(this);
      zoneSelection.append('rect')
        .attr('x', zone.x)
        .attr('y', zone.y)
        .attr('width', zone.width)
        .attr('height', zone.height)
        .attr('rx', 24);
      zoneSelection.append('text')
        .attr('x', zone.x + 24)
        .attr('y', zone.y + 34)
        .text(zone.key);
    });

  function worksOfAuthor(authorId) {
    return data.links.filter((l) => l.label === '作者' && l.target === authorId)
      .map((l) => data.nodes.find((n) => n.id === l.source))
      .filter(Boolean);
  }

  function charsOfWork(workId) {
    return data.nodes.filter((n) => n.type === '人物' && data.links.some((l) => {
      const same = l.source === n.id && l.target === workId;
      const reverse = l.source === workId && l.target === n.id;
      return same || reverse;
    }));
  }

  function computeLayout() {
    const nodeBase = nodeSizeInput ? +nodeSizeInput.value : 10;
    const clusterSpacing = clusterInput ? +clusterInput.value : 80;
    const groups = new Map();
    data.nodes.forEach((nodeItem) => {
      const key = nodeItem.type === '作品' ? `作品:${nodeItem.level}` : nodeItem.type;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(nodeItem);
    });

    const placeGrid = (items, left, top, columns, cellWidth, cellHeight) => {
      items.forEach((nodeItem, index) => {
        nodeItem.x = left + (index % columns) * cellWidth;
        nodeItem.y = top + Math.floor(index / columns) * cellHeight;
      });
    };

    const works = data.nodes.filter((nodeItem) => nodeItem.type === '作品');
    const workCenters = new Map();
    const desiredPositions = new Map();

    function addDesiredPosition(nodeId, x, y) {
      if (!desiredPositions.has(nodeId)) desiredPositions.set(nodeId, []);
      desiredPositions.get(nodeId).push({ x, y });
    }

    clusterZones.forEach((zone) => {
      const items = groups.get(`作品:${zone.key}`) || [];
      placeGrid(items, zone.left, zone.top, zone.columns, zone.cellWidth, zone.cellHeight);
      items.forEach((work, index) => {
        const center = { x: work.x, y: work.y };
        workCenters.set(work.id, center);
        addDesiredPosition(work.id, center.x, center.y);

        const related = data.links.filter((linkItem) => linkItem.source === work.id || linkItem.target === work.id);
        const author = related.map((linkItem) => data.nodes.find((n) => n.id === (linkItem.source === work.id ? linkItem.target : linkItem.source)))
          .find((nodeItem) => nodeItem && nodeItem.type === '作者');
        const people = related.map((linkItem) => data.nodes.find((n) => n.id === (linkItem.source === work.id ? linkItem.target : linkItem.source)))
          .filter((nodeItem) => nodeItem && nodeItem.type === '人物');
        const themes = related.map((linkItem) => data.nodes.find((n) => n.id === (linkItem.source === work.id ? linkItem.target : linkItem.source)))
          .filter((nodeItem) => nodeItem && nodeItem.type === '主题');
        const eras = related.map((linkItem) => data.nodes.find((n) => n.id === (linkItem.source === work.id ? linkItem.target : linkItem.source)))
          .filter((nodeItem) => nodeItem && nodeItem.type === '时代');

        if (author) addDesiredPosition(author.id, center.x, center.y - 88);
        people.forEach((person, personIndex) => {
          addDesiredPosition(person.id, center.x - 94, center.y + (personIndex - (people.length - 1) / 2) * 34);
        });
        themes.forEach((theme, themeIndex) => {
          addDesiredPosition(theme.id, center.x + 104, center.y + (themeIndex - (themes.length - 1) / 2) * 34);
        });
        eras.forEach((era, eraIndex) => {
          addDesiredPosition(era.id, center.x + (eraIndex - (eras.length - 1) / 2) * 58, center.y + 88);
        });
      });
    });

    desiredPositions.forEach((positions, nodeId) => {
      const nodeItem = data.nodes.find((candidate) => candidate.id === nodeId);
      if (!nodeItem) return;
      nodeItem.x = positions.reduce((sum, position) => sum + position.x, 0) / positions.length;
      nodeItem.y = positions.reduce((sum, position) => sum + position.y, 0) / positions.length;
    });

    return { nodeBase, clusterSpacing };
  }

  function linkDistanceByLabel(link, clusterSpacing) {
    const lab = (link.label || '').toLowerCase();
    if (lab.includes('包含') || lab.includes('属于') || lab.includes('作者')) return Math.max(40, clusterSpacing * 0.6);
    if (lab.includes('情感') || lab.includes('相关') || lab.includes('相近')) return Math.max(60, clusterSpacing * 0.9);
    return Math.max(100, clusterSpacing * 1.45);
  }

  const node = nodeGroup.selectAll('g.node')
    .data(data.nodes)
    .enter()
    .append('g')
    .attr('class', 'node')
    .classed('node--work', (d) => d.type === '作品')
    .classed('node--era', (d) => d.type === '时代')
    .on('click', (event, d) => {
      event.stopPropagation();
      showDetails(d);
    });

  node.append('circle')
    .attr('fill', (d) => colorForType(d.type));

  node.append('text')
    .attr('dy', 4)
    .each(function (d) {
      const text = d3.select(this);
      const splitAt = Math.ceil(d.label.length / 2);
      const chunks = d.type === '作品' && d.label.length > 6
        ? [d.label.slice(0, splitAt), d.label.slice(splitAt)]
        : [d.label];
      chunks.forEach((chunk, index) => {
        text.append('tspan')
          .attr('x', 0)
          .attr('dy', index === 0 ? (chunks.length === 1 ? 4 : -3) : 13)
          .text(chunk);
      });
    });

  let link = linkGroup.selectAll('line').data([]).join('line');

  function applyLayout() {
    const { nodeBase } = computeLayout();

    node.attr('transform', (d) => `translate(${d.x || 0},${d.y || 0})`);

    node.select('circle').attr('r', (d) => {
      if (d.type === '作品') return Math.max(16, nodeBase + 6);
      if (d.type === '时代') return Math.max(13, nodeBase + 3);
      return nodeBase + ((d.level || 1) * 2);
    });
    node.select('text').each(function (d) {
      const r = d.type === '作品'
        ? Math.max(16, nodeBase + 6)
        : (d.type === '时代' ? Math.max(13, nodeBase + 3) : nodeBase + 2);
      const isLeft = d.type === '人物';
      const isRight = d.type === '主题';
      const tx = isLeft ? -(r + 9) : (isRight ? -(r + 9) : r + 9);
      const ty = 4;
      d3.select(this)
        .attr('x', tx)
        .attr('y', ty)
        .attr('text-anchor', isLeft || isRight ? 'end' : 'start');
    });

    link
      .attr('x1', (d) => {
        const s = typeof d.source === 'object' ? d.source : data.nodes.find((n) => n.id === d.source);
        return s ? s.x : 0;
      })
      .attr('y1', (d) => {
        const s = typeof d.source === 'object' ? d.source : data.nodes.find((n) => n.id === d.source);
        return s ? s.y : 0;
      })
      .attr('x2', (d) => {
        const t = typeof d.target === 'object' ? d.target : data.nodes.find((n) => n.id === d.target);
        return t ? t.x : 0;
      })
      .attr('y2', (d) => {
        const t = typeof d.target === 'object' ? d.target : data.nodes.find((n) => n.id === d.target);
        return t ? t.y : 0;
      });
  }

  applyLayout();

  const linksSim = data.links.map((l) => ({
    source: data.nodes.find((n) => n.id === l.source),
    target: data.nodes.find((n) => n.id === l.target),
    label: l.label
  })).filter((l) => l.source && l.target);

  link = linkGroup.selectAll('line')
    .data(linksSim)
    .enter()
    .append('line')
    .attr('class', 'link')
    .attr('marker-end', 'url(#arrow)');
  applyLayout();

  function updateLayout() {
    applyLayout();
  }

  if (nodeSizeInput) nodeSizeInput.addEventListener('input', updateLayout);
  if (clusterInput) clusterInput.addEventListener('input', updateLayout);

  const types = Array.from(new Set(data.nodes.map((n) => n.type))).sort();
  const typeState = new Map(types.map((t) => [t, true]));

  types.forEach((type) => {
    const button = document.createElement('button');
    button.className = 'filter-chip active';
    button.textContent = type;
    button.setAttribute('data-type', type);
    button.addEventListener('click', () => {
      const next = !typeState.get(type);
      typeState.set(type, next);
      button.classList.toggle('active', next);
      applyFilters();
    });
    filters.appendChild(button);
  });

  searchInput.addEventListener('input', applyFilters);

  function applyFilters() {
    const query = searchInput.value.trim().toLowerCase();
    const activeTypes = types.filter((t) => typeState.get(t));

    data.nodes.forEach((d) => {
      const okType = activeTypes.includes(d.type);
      const okQuery = query === '' || d.label.toLowerCase().includes(query);
      d._visible = okType && okQuery;
    });

    node.style('display', (d) => (d._visible ? null : 'none'));

    const visibleIds = new Set(data.nodes.filter((n) => n._visible).map((n) => n.id));

    link.style('display', (l) => {
      const sId = typeof l.source === 'object' ? l.source.id : l.source;
      const tId = typeof l.target === 'object' ? l.target.id : l.target;
      return visibleIds.has(sId) && visibleIds.has(tId) ? null : 'none';
    });

    updateStats();
  }

  function updateStats() {
    const visibleNodes = data.nodes.filter((n) => n._visible).length;
    const visibleLinks = data.links.filter((l) => {
      const sId = l.source;
      const tId = l.target;
      return data.nodes.find((n) => n.id === sId)?._visible && data.nodes.find((n) => n.id === tId)?._visible;
    }).length;

    statNodes.textContent = visibleNodes;
    statLinks.textContent = visibleLinks;
    statTypes.textContent = types.filter((t) => typeState.get(t)).length;
  }

  function showDetails(d) {
    document.getElementById('detail-title').textContent = d.label;
    document.getElementById('detail-type').textContent = '类型：' + (d.type || '');
    document.getElementById('detail-badge').textContent = d.type || '节点';

    const getId = (value) => (typeof value === 'object' ? value.id : value);
    const neighborLinks = data.links.filter((l) => getId(l.source) === d.id || getId(l.target) === d.id);
    const neighborIds = Array.from(new Set(neighborLinks.flatMap((l) => [getId(l.source), getId(l.target)]).filter((id) => id !== d.id)));

    const authors = neighborIds.map((id) => data.nodes.find((n) => n.id === id)).filter((n) => n && n.type === '作者');
    const themes = neighborIds.map((id) => data.nodes.find((n) => n.id === id)).filter((n) => n && n.type === '主题');
    const persons = neighborIds.map((id) => data.nodes.find((n) => n.id === id)).filter((n) => n && n.type === '人物');
    const arts = neighborIds.map((id) => data.nodes.find((n) => n.id === id)).filter((n) => n && n.type === '艺术手法');
    const works = neighborIds.map((id) => data.nodes.find((n) => n.id === id)).filter((n) => n && n.type === '作品');

    let html = '';
    if (d.type === '作品') {
      html += `<div class="detail-meta"><strong>归档分级：</strong>${d.level || '未分类'}<br><strong>作者：</strong>${d.author || '未详'}<br><strong>成书时代：</strong>${d.period || '未详'}<br><strong>叙事时代：</strong>${d.setting || '未详'}<br><strong>题材类型：</strong>${d.genre || '未详'}</div>`;
      if (d.edition) html += `<div class="detail-edition"><strong>版本信息：</strong>${d.edition}</div>`;
    }
    if (d.desc) html += `<div style="margin-bottom:8px">${d.desc}</div>`;
    if (authors.length) html += `<div><strong>作者：</strong>${authors.map((a) => a.label).join('，')}</div>`;
    if (themes.length) html += `<div><strong>相关主题：</strong>${themes.map((t) => t.label).join('，')}</div>`;
    if (persons.length) html += `<div><strong>相关人物：</strong>${persons.map((p) => p.label).join('，')}</div>`;
    if (arts.length) html += `<div><strong>艺术手法：</strong>${arts.map((a) => a.label).join('，')}</div>`;
    if (works.length) html += `<div><strong>相关作品：</strong>${works.map((w) => w.label).join('，')}</div>`;

    html += `<div style="margin-top:8px"><strong>阅读建议：</strong>建议先整理作品背景与人物关系，再结合${themes.length ? themes.map((t) => t.label).slice(0, 2).join('、') : '主题'}展开阅读。</div>`;
    html += '<div style="margin-top:8px"><strong>可跳转的关联节点：</strong></div>';
    html += '<div style="margin-top:6px">';
    if (neighborIds.length === 0) html += '（无）';
    neighborIds.forEach((id) => {
      const nd = data.nodes.find((n) => n.id === id);
      if (!nd) return;
      html += `<div class="neighbor-link" data-id="${nd.id}">${nd.label}（${nd.type}）</div>`;
    });
    html += '</div>';

    document.getElementById('detail-desc').innerHTML = html;

    document.querySelectorAll('#detail-desc [data-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const nid = +el.getAttribute('data-id');
        const nd = data.nodes.find((n) => n.id === nid);
        if (nd) showDetails(nd);
      });
    });

    node.classed('is-selected', false);
    link.classed('highlight', false);
    node.filter((n) => n.id === d.id || neighborIds.includes(n.id)).classed('is-selected', true);
    link.filter((l) => {
      const s = getId(l.source);
      const t = getId(l.target);
      return s === d.id || t === d.id || neighborIds.includes(s) || neighborIds.includes(t);
    }).classed('highlight', true);
  }

  function fitView() {
    const visibleNodes = data.nodes.filter((n) => n._visible !== false);
    if (!visibleNodes.length) return;
    const minX = d3.min(visibleNodes, (d) => d.x) - 80;
    const maxX = d3.max(visibleNodes, (d) => d.x) + 80;
    const minY = d3.min(visibleNodes, (d) => d.y) - 80;
    const maxY = d3.max(visibleNodes, (d) => d.y) + 80;
    const scale = Math.min(1.8, Math.max(0.45, 0.9 / Math.max((maxX - minX) / width, (maxY - minY) / height)));
    const transform = d3.zoomIdentity.translate(width / 2, height / 2).scale(scale).translate(-(minX + maxX) / 2, -(minY + maxY) / 2);
    svg.transition().duration(600).call(zoom.transform, transform);
  }

  function resetView() {
    svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity);
  }

  document.getElementById('fit-view').addEventListener('click', fitView);
  document.getElementById('reset-view').addEventListener('click', resetView);

  function colorForType(type) {
    if (type === '作品') return '#ffd6a5';
    if (type === '人物') return '#cfe8ff';
    if (type === '作者') return '#fff2b8';
    if (type === '时代') return '#f2d5f7';
    return '#d4f5d4';
  }

  applyFilters();
  fitView();
})();

