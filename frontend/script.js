// Uses a relative path so it works both behind an Nginx reverse-proxy locally
// and behind a Kubernetes Ingress that routes /api/* to the backend service.
const API_BASE = '/api/tasks';

const form = document.getElementById('task-form');
const input = document.getElementById('task-input');
const list = document.getElementById('task-list');
const status = document.getElementById('status');

async function loadTasks() {
  status.textContent = 'Loading...';
  try {
    const res = await fetch(API_BASE);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const tasks = await res.json();
    render(tasks);
    status.textContent = `${tasks.length} task(s) loaded`;
  } catch (err) {
    status.textContent = `Error loading tasks: ${err.message}`;
  }
}

function render(tasks) {
  list.innerHTML = '';
  tasks.forEach((t) => {
    const li = document.createElement('li');
    if (t.done) li.classList.add('done');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = t.done;
    checkbox.addEventListener('change', () => toggleDone(t.id, checkbox.checked));

    const span = document.createElement('span');
    span.textContent = t.title;

    const del = document.createElement('button');
    del.textContent = '✕';
    del.className = 'del';
    del.addEventListener('click', () => deleteTask(t.id));

    li.append(checkbox, span, del);
    list.appendChild(li);
  });
}

async function toggleDone(id, done) {
  await fetch(`${API_BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ done }),
  });
  loadTasks();
}

async function deleteTask(id) {
  await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
  loadTasks();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = input.value.trim();
  if (!title) return;
  await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  input.value = '';
  loadTasks();
});

loadTasks();
