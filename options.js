// Options page logic for PromptSlash

let prompts = [];
let editingId = null;

// DOM elements
const form = document.getElementById('prompt-form');
const labelInput = document.getElementById('label');
const contentInput = document.getElementById('content');
const promptIdInput = document.getElementById('prompt-id');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');
const formTitle = document.getElementById('form-title');
const promptsContainer = document.getElementById('prompts-container');

// Load prompts from storage
function loadPrompts() {
  chrome.storage.sync.get(['prompts'], (result) => {
    prompts = result.prompts || [];
    renderPrompts();
  });
}

// Render prompts list
function renderPrompts() {
  if (prompts.length === 0) {
    promptsContainer.innerHTML = '<div class="empty-state">No prompts yet. Add one above!</div>';
    return;
  }

  promptsContainer.innerHTML = prompts.map(prompt => `
    <div class="prompt-item">
      <div class="prompt-item-content">
        <div class="prompt-item-label">${escapeHtml(prompt.label)}</div>
        <div class="prompt-item-body">${escapeHtml(prompt.content)}</div>
      </div>
      <div class="prompt-item-actions">
        <button class="btn-primary btn-small edit-btn" data-id="${prompt.id}">Edit</button>
        <button class="btn-danger btn-small delete-btn" data-id="${prompt.id}">Delete</button>
      </div>
    </div>
  `).join('');
}

// Event delegation for edit/delete buttons
promptsContainer.addEventListener('click', (e) => {
  const target = e.target;
  
  if (target.classList.contains('edit-btn')) {
    const id = target.getAttribute('data-id');
    editPrompt(id);
  } else if (target.classList.contains('delete-btn')) {
    const id = target.getAttribute('data-id');
    deletePrompt(id);
  }
});

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Save prompt (add or update)
function savePrompt(promptData) {
  if (editingId) {
    // Update existing
    const index = prompts.findIndex(p => p.id === editingId);
    if (index !== -1) {
      prompts[index] = { ...prompts[index], ...promptData };
    }
  } else {
    // Add new
    prompts.push({
      id: crypto.randomUUID(),
      ...promptData
    });
  }

  chrome.storage.sync.set({ prompts }, () => {
    loadPrompts();
    resetForm();
  });
}

// Edit prompt
function editPrompt(id) {
  const prompt = prompts.find(p => p.id === id);
  if (!prompt) return;

  editingId = id;
  promptIdInput.value = id;
  labelInput.value = prompt.label;
  contentInput.value = prompt.content;
  
  formTitle.textContent = 'Edit Prompt';
  saveBtn.textContent = 'Update Prompt';
  cancelBtn.style.display = 'block';
  
  // Scroll to form
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Delete prompt
function deletePrompt(id) {
  if (!confirm('Are you sure you want to delete this prompt?')) {
    return;
  }

  prompts = prompts.filter(p => p.id !== id);
  chrome.storage.sync.set({ prompts }, () => {
    loadPrompts();
  });
}

// Reset form
function resetForm() {
  editingId = null;
  form.reset();
  promptIdInput.value = '';
  formTitle.textContent = 'Add New Prompt';
  saveBtn.textContent = 'Save Prompt';
  cancelBtn.style.display = 'none';
}

// Form submission
form.addEventListener('submit', (e) => {
  e.preventDefault();

  const label = labelInput.value.trim();
  const content = contentInput.value.trim();

  if (!label || !content) {
    alert('Please fill in all fields');
    return;
  }

  savePrompt({ label, content });
});

// Cancel button
cancelBtn.addEventListener('click', () => {
  resetForm();
});

// Site Management Logic
const siteListTextarea = document.getElementById('siteList');
const saveSitesBtn = document.getElementById('save-sites-btn');
const siteModeRadios = document.getElementsByName('siteMode');

// Load site settings
function loadSiteSettings() {
  chrome.storage.sync.get(['siteSettings'], (result) => {
    const settings = result.siteSettings || { mode: 'all', sites: [] };
    
    // Set mode
    for (const radio of siteModeRadios) {
      if (radio.value === settings.mode) {
        radio.checked = true;
        break;
      }
    }
    
    // Set sites
    siteListTextarea.value = settings.sites.join('\n');
  });
}

// Save site settings
saveSitesBtn.addEventListener('click', () => {
  let mode = 'all';
  for (const radio of siteModeRadios) {
    if (radio.checked) {
      mode = radio.value;
      break;
    }
  }
  
  const sites = siteListTextarea.value
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);
    
  chrome.storage.sync.set({ 
    siteSettings: { mode, sites } 
  }, () => {
    // Show feedback
    const originalText = saveSitesBtn.textContent;
    saveSitesBtn.textContent = 'Saved!';
    setTimeout(() => {
      saveSitesBtn.textContent = originalText;
    }, 1500);
  });
});

// Load everything on page load
loadPrompts();
loadSiteSettings();
