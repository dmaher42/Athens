import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, arrayUnion } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

if (!getApps().length) {
  if (!window.firebaseConfig) {
    throw new Error('Missing Firebase configuration. Define window.firebaseConfig before loading app.js.');
  }
  initializeApp(window.firebaseConfig);
}

const db = getFirestore(getApp());

const cuesView = document.getElementById('cues-view');
const dailyListView = document.getElementById('daily-list-view');
const tabButtons = document.querySelectorAll('[data-tab-target]');
const dailyListHeader = document.getElementById('daily-list-header');
const dailyTasksContainer = document.getElementById('daily-tasks-container');
const quickAddForm = document.getElementById('quick-add-form');
const quickAddInput = document.getElementById('quick-add-input');
const clearCompletedBtn = document.getElementById('clear-completed-btn');

let currentDailyListId = null;
let currentDailyTasks = [];

const getTodayDateId = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = `${today.getMonth() + 1}`.padStart(2, '0');
  const day = `${today.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatHumanReadableDate = (dateId) => {
  const [year, month, day] = dateId.split('-').map((value) => parseInt(value, 10));
  const parsed = new Date(year, month - 1, day);
  return parsed.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

const dailyListDoc = (dateId) => doc(db, 'dailyLists', dateId);

const normalizeTasks = (tasks) => {
  if (!Array.isArray(tasks)) {
    return [];
  }

  return tasks
    .map((task) => ({
      text: typeof task?.text === 'string' ? task.text : '',
      completed: Boolean(task?.completed),
    }))
    .filter((task) => task.text.trim().length > 0);
};

const renderDailyTasks = (tasks) => {
  dailyTasksContainer.innerHTML = '';

  if (!tasks.length) {
    const emptyState = document.createElement('p');
    emptyState.className = 'text-sm text-base-content/70';
    emptyState.textContent = 'No tasks yet. Add one using the quick add form.';
    dailyTasksContainer.appendChild(emptyState);
    return;
  }

  tasks.forEach((task, index) => {
    const label = document.createElement('label');
    label.className = 'flex items-center gap-3 rounded-lg border border-base-300 bg-base-100 p-3 shadow-sm';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'checkbox checkbox-primary daily-task-checkbox';
    checkbox.dataset.index = String(index);
    checkbox.checked = Boolean(task.completed);

    const span = document.createElement('span');
    span.className = 'text-base';
    span.textContent = task.text;
    if (task.completed) {
      span.classList.add('line-through', 'opacity-60');
    }

    label.appendChild(checkbox);
    label.appendChild(span);
    dailyTasksContainer.appendChild(label);
  });
};

const loadDailyList = async () => {
  const todayId = getTodayDateId();
  currentDailyListId = todayId;
  dailyListHeader.textContent = `Today's List - ${formatHumanReadableDate(todayId)}`;

  try {
    const snapshot = await getDoc(dailyListDoc(todayId));
    currentDailyTasks = snapshot.exists() ? normalizeTasks(snapshot.data().tasks) : [];
  } catch (error) {
    console.error('Failed to load daily list tasks:', error);
    currentDailyTasks = [];
  }

  renderDailyTasks(currentDailyTasks);
};

const setActiveTab = (activeTab) => {
  tabButtons.forEach((tab) => {
    const isActive = tab === activeTab;
    tab.classList.toggle('tab-active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
};

const showView = (targetId) => {
  if (!cuesView || !dailyListView) {
    return;
  }

  if (targetId === 'daily-list-view') {
    cuesView.classList.add('hidden');
    dailyListView.classList.remove('hidden');
  } else {
    cuesView.classList.remove('hidden');
    dailyListView.classList.add('hidden');
  }
};

tabButtons.forEach((tab) => {
  tab.addEventListener('click', async (event) => {
    event.preventDefault();
    const { tabTarget } = tab.dataset;
    if (!tabTarget) {
      return;
    }

    setActiveTab(tab);
    showView(tabTarget);

    if (tabTarget === 'daily-list-view') {
      await loadDailyList();
    }
  });
});

setActiveTab(document.getElementById('tab-cues'));
showView('cues-view');

quickAddForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = quickAddInput.value.trim();
  if (!text) {
    return;
  }

  const todayId = currentDailyListId ?? getTodayDateId();
  const newTask = { text, completed: false };

  try {
    await setDoc(dailyListDoc(todayId), { tasks: arrayUnion(newTask) }, { merge: true });
    quickAddInput.value = '';
    await loadDailyList();
  } catch (error) {
    console.error('Failed to add quick task:', error);
  }
});

dailyTasksContainer?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.classList.contains('daily-task-checkbox')) {
    return;
  }

  const index = Number.parseInt(target.dataset.index ?? '', 10);
  if (!Number.isInteger(index) || !currentDailyTasks[index]) {
    return;
  }

  currentDailyTasks = currentDailyTasks.map((task, taskIndex) => (
    taskIndex === index ? { ...task, completed: target.checked } : task
  ));
  renderDailyTasks(currentDailyTasks);

  const todayId = currentDailyListId ?? getTodayDateId();
  try {
    await setDoc(dailyListDoc(todayId), { tasks: currentDailyTasks }, { merge: true });
  } catch (error) {
    console.error('Failed to update task completion:', error);
  }
});

clearCompletedBtn?.addEventListener('click', async () => {
  if (!currentDailyTasks.length) {
    return;
  }

  const todayId = currentDailyListId ?? getTodayDateId();
  const remainingTasks = currentDailyTasks.filter((task) => !task.completed);

  if (remainingTasks.length === currentDailyTasks.length) {
    return;
  }

  currentDailyTasks = remainingTasks;
  renderDailyTasks(currentDailyTasks);

  try {
    await setDoc(dailyListDoc(todayId), { tasks: remainingTasks }, { merge: true });
  } catch (error) {
    console.error('Failed to clear completed tasks:', error);
  }
});
