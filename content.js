// PromptSlash Content Script - Main logic for prompt picker

let isDropdownOpen = false;
let currentTrigger = '';
let selectedIndex = 0;
let filteredPrompts = [];
let dropdownElement = null;
let currentElement = null;
let triggerStartPosition = null;
let triggerRange = null;

// Initialize
function init() {
  console.log('PromptSlash: init() called', { url: window.location.href });
  chrome.storage.sync.get(['siteSettings'], (result) => {
    const allowed = isSiteAllowed(result.siteSettings);
    console.log('PromptSlash: Site allowed check in init', {
      allowed,
      settings: result.siteSettings
    });
    if (allowed) {
      initializeExtension();
    } else {
      console.log('PromptSlash: Site blocked, not initializing');
    }
  });
}

function initializeExtension() {
  // Prevent multiple initializations
  if (window.promptSlashInitialized) {
    console.log('PromptSlash: Already initialized, skipping...');
    return;
  }
  window.promptSlashInitialized = true;
  
  console.log('PromptSlash: Initializing extension...');
  
  // Create dropdown element
  createDropdown();
  
  // Listen for input events only (not keyup to avoid interference with navigation)
  document.addEventListener('input', handleInput, true);
  
  // Listen for keydown events
  document.addEventListener('keydown', handleKeyDown, true);
  
  // Listen for clicks to close dropdown
  document.addEventListener('click', handleClick, true);
  
  // Listen for scroll to reposition dropdown
  window.addEventListener('scroll', handleScroll, true);
  
  console.log('PromptSlash: Extension initialized successfully!');
}

// Check if site is allowed based on settings
function isSiteAllowed(settings) {
  if (!settings) return true; // Default to allow if no settings
  
  const currentHost = window.location.hostname;
  const sites = settings.sites || [];
  const mode = settings.mode || 'all';
  
  // Helper to normalize domain (strip protocol and path)
  const normalizeDomain = (input) => {
    if (!input) return '';
    let domain = input.trim();
    
    // Remove protocol (http://, https://, etc.)
    domain = domain.replace(/^https?:\/\//i, '');
    
    // Remove path (everything after first /)
    domain = domain.split('/')[0];
    
    // Remove www. prefix for better matching
    domain = domain.replace(/^www\./i, '');
    
    return domain.toLowerCase();
  };
  
  const normalizedCurrent = normalizeDomain(currentHost);
  
  // Check if current host matches any pattern
  const matches = sites.some(site => {
    const normalizedSite = normalizeDomain(site);
    if (!normalizedSite) return false;
    
    // Check if domains match (either exact or subdomain)
    return normalizedCurrent === normalizedSite || 
           normalizedCurrent.endsWith('.' + normalizedSite) ||
           normalizedSite.endsWith('.' + normalizedCurrent);
  });
  
  if (mode === 'specific') {
    // Only allow if matches
    return matches;
  } else {
    // 'all' mode: allow unless it matches (blocked)
    return !matches;
  }
}

// Create dropdown DOM element
function createDropdown() {
  dropdownElement = document.createElement('ul');
  dropdownElement.className = 'prompt-slash-dropdown';
  dropdownElement.style.display = 'none';
  document.body.appendChild(dropdownElement);
}

// Simple but comprehensive editable element detection
function isEditableElement(element) {
  if (!element) return false;
  
  // Standard inputs
  if (element.tagName === 'INPUT') {
    const type = element.type || 'text';
    // Allow most input types except buttons, checkboxes, etc.
    const allowedTypes = ['text', 'search', 'email', 'url', 'tel', 'password', 'number'];
    if (allowedTypes.includes(type.toLowerCase())) {
      return true;
    }
  }
  
  if (element.tagName === 'TEXTAREA') {
    return true;
  }
  
  // ContentEditable - check multiple ways
  if (element.isContentEditable) return true;
  if (element.contentEditable === 'true') return true;
  if (element.getAttribute && element.getAttribute('contenteditable') === 'true') return true;
  
  // Check for common editor classes (case insensitive)
  const className = (element.className || '').toLowerCase();
  const editorClasses = [
    'ql-editor',           // Quill (Gemini)
    'mce-content-body',    // TinyMCE
    'cke_editable',        // CKEditor
    'codeMirror',          // CodeMirror
    'monaco-editor',       // Monaco
    'editor',              // Generic
    'input',               // Generic
    'text-input',          // Generic
    'message-input',       // Chat apps
    'chat-input',          // Chat apps
    'prompt-input',        // AI chat apps
    'composer',            // Message composers
    'editable'             // Generic
  ];
  
  if (editorClasses.some(cls => className.includes(cls))) {
    return true;
  }
  
  // Role attribute
  const role = element.getAttribute && element.getAttribute('role');
  if (role === 'textbox' || role === 'searchbox') {
    return true;
  }
  
  // Check data attributes commonly used in editors
  const dataAttrs = ['data-placeholder', 'data-testid', 'data-slate-editor', 'data-gramm'];
  for (const attr of dataAttrs) {
    if (element.hasAttribute && element.hasAttribute(attr)) {
      const attrValue = element.getAttribute(attr);
      if (attrValue && attrValue.toLowerCase().includes('input')) {
        return true;
      }
    }
  }
  
  return false;
}

// Handle input events
function handleInput(e) {
  const target = e.target;
  
  // Try to find any editable element - be very permissive
  let editableElement = target;
  
  // Check target and up to 3 parent levels for editable elements
  for (let i = 0; i < 4; i++) {
    if (!editableElement) break;
    
    if (isEditableElement(editableElement)) {
      currentElement = editableElement;
      break;
    }
    editableElement = editableElement.parentElement;
  }
  
  if (!currentElement || !isEditableElement(currentElement)) {
    console.log('PromptSlash: Element not editable', {
      found: !!currentElement,
      isEditable: currentElement ? isEditableElement(currentElement) : false
    });
    return;
  }
  
  console.log('PromptSlash: Found editable element!', {
    tagName: currentElement.tagName,
    className: currentElement.className
  });
  
  // Handle standard inputs
  if (currentElement.tagName === 'INPUT' || currentElement.tagName === 'TEXTAREA') {
    const text = currentElement.value || '';
    const cursorPos = currentElement.selectionStart || 0;
    
    const match = findTrigger(text, cursorPos);
    if (match) {
      currentTrigger = match.triggerText;
      triggerStartPosition = match.startPos;
      fetchAndShowPrompts(currentElement);
    } else {
      hideDropdown();
    }
    return;
  }
  
  // Handle contenteditable - get ALL text and find trigger
  const selection = window.getSelection();
  if (!selection.rangeCount) {
    hideDropdown();
    return;
  }
  
  const range = selection.getRangeAt(0);
  let node = range.startContainer;
  let offset = range.startOffset;
  
  // Get the text content - try multiple strategies
  let text = '';
  let textNode = null;
  
  // Strategy 1: If we have a text node, use it directly
  if (node.nodeType === Node.TEXT_NODE) {
    text = node.textContent || '';
    textNode = node;
  }
  // Strategy 2: If element node, get its text content
  else if (node.nodeType === Node.ELEMENT_NODE) {
    // Try to find text in children
    const walker = document.createTreeWalker(
      node,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let foundNode = walker.nextNode();
    while (foundNode) {
      if (foundNode.textContent) {
        textNode = foundNode;
        text = foundNode.textContent;
        offset = text.length; // Assume cursor at end
        break;
      }
      foundNode = walker.nextNode();
    }
    
    // If still no text, try the whole element
    if (!text) {
      text = node.textContent || node.innerText || '';
      textNode = node;
      offset = Math.min(offset, text.length);
    }
  }
  
  // Fallback: Get text from the editable element itself
  if (!text && currentElement) {
    text = currentElement.textContent || currentElement.innerText || '';
    offset = text.length;
  }
  
  const match = findTrigger(text, offset);
  console.log('PromptSlash: Looking for trigger in text:', {
    text: text.substring(Math.max(0, offset - 10), offset + 10),
    offset,
    foundMatch: !!match
  });
  
  if (match) {
    currentTrigger = match.triggerText;
    console.log('PromptSlash: Trigger found!', { triggerText: currentTrigger });
    
    // Try to create range for replacement
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      try {
        const replaceRange = document.createRange();
        replaceRange.setStart(textNode, match.startPos);
        replaceRange.setEnd(textNode, offset);
        triggerRange = replaceRange;
      } catch (e) {
        console.log('Could not create range:', e);
        triggerRange = null;
      }
    } else {
      triggerRange = null;
    }
    
    fetchAndShowPrompts(currentElement);
  } else {
    hideDropdown();
  }
}

// Helper function to find first text node in an element
function findFirstTextNode(element) {
  if (!element) return null;
  if (element.nodeType === Node.TEXT_NODE) {
    return element;
  }
  
  for (let child of element.childNodes) {
    const textNode = findFirstTextNode(child);
    if (textNode) return textNode;
  }
  
  return null;
}

// Find // trigger in text
function findTrigger(text, cursorPos) {
  let i = cursorPos - 1;
  let slashCount = 0;
  let startPos = -1;
  
  while (i >= 0) {
    if (text[i] === '/') {
      slashCount++;
      if (slashCount === 2) {
        startPos = i;
        break;
      }
    } else if (text[i] === ' ' || text[i] === '\n' || text[i] === '\t') {
      break;
    } else {
      slashCount = 0;
    }
    i--;
  }
  
  // Ensure exactly 2 slashes
  if (startPos > 0 && text[startPos - 1] === '/') {
    return null;
  }
  
  if (startPos !== -1 && startPos < cursorPos) {
    const triggerText = text.substring(startPos + 2, cursorPos);
    return { triggerText, startPos };
  }
  
  return null;
}

// Fetch prompts and show dropdown
function fetchAndShowPrompts(target) {
  console.log('PromptSlash: Fetching prompts...');
  chrome.storage.sync.get(['prompts', 'siteSettings'], (result) => {
    console.log('PromptSlash: Got storage data', {
      promptCount: result.prompts?.length || 0,
      siteSettings: result.siteSettings
    });
    
    // Check if site is allowed
    const siteAllowed = isSiteAllowed(result.siteSettings);
    console.log('PromptSlash: Site check', {
      allowed: siteAllowed,
      currentHost: window.location.hostname
    });
    
    if (!siteAllowed) {
      console.log('PromptSlash: Site blocked by settings!');
      hideDropdown();
      return;
    }
    
    const prompts = result.prompts || [];
    const newFilteredPrompts = filterPrompts(prompts, currentTrigger);
    
    if (newFilteredPrompts.length > 0) {
      // Check if the filtered list changed
      const listChanged = JSON.stringify(newFilteredPrompts) !== JSON.stringify(filteredPrompts);
      
      filteredPrompts = newFilteredPrompts;
      
      // Reset selection to 0 if list changed
      if (listChanged || !isDropdownOpen) {
        selectedIndex = 0;
      }
      
      // Make sure selection is still valid
      if (selectedIndex >= filteredPrompts.length) {
        selectedIndex = filteredPrompts.length - 1;
      }
      
      showDropdown(target);
    } else {
      hideDropdown();
    }
  });
}

// Filter prompts based on trigger text
function filterPrompts(prompts, trigger) {
  if (!trigger) return prompts;
  
  const lowerTrigger = trigger.toLowerCase();
  return prompts.filter(p => 
    p.label.toLowerCase().includes(lowerTrigger)
  );
}

// Show dropdown
function showDropdown(element) {
  isDropdownOpen = true;
  renderDropdown();
  
  dropdownElement.style.display = 'block';
  dropdownElement.style.visibility = 'hidden';
  
  try {
    positionDropdown(element);
  } catch (error) {
    console.error('Error in showDropdown:', error);
  } finally {
    dropdownElement.style.visibility = 'visible';
  }
}

// Hide dropdown
function hideDropdown() {
  isDropdownOpen = false;
  currentTrigger = '';
  selectedIndex = 0;
  filteredPrompts = [];
  triggerStartPosition = null;
  triggerRange = null;
  if (dropdownElement) {
    dropdownElement.style.display = 'none';
  }
}

// Render dropdown items
function renderDropdown() {
  if (!dropdownElement) return;
  
  dropdownElement.innerHTML = filteredPrompts.map((prompt, index) => `
    <li class="prompt-slash-item ${index === selectedIndex ? 'selected' : ''}" data-index="${index}">
      <span class="prompt-slash-item-label">${escapeHtml(prompt.label)}</span>
      <span class="prompt-slash-item-content">${escapeHtml(prompt.content)}</span>
    </li>
  `).join('');
}

// Position dropdown near caret
function positionDropdown(element) {
  if (!dropdownElement || !element) return;
  
  try {
    const selection = window.getSelection();
    let rect;
    
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      rect = element.getBoundingClientRect();
      dropdownElement.style.top = `${rect.bottom + window.scrollY + 4}px`;
      dropdownElement.style.left = `${rect.left + window.scrollX}px`;
    } else if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const caretRect = range.getBoundingClientRect();
      
      if (caretRect.width > 0 || caretRect.height > 0) {
        dropdownElement.style.top = `${caretRect.bottom + window.scrollY + 4}px`;
        dropdownElement.style.left = `${caretRect.left + window.scrollX}px`;
      } else {
        // Fallback to element position
        rect = element.getBoundingClientRect();
        dropdownElement.style.top = `${rect.bottom + window.scrollY + 4}px`;
        dropdownElement.style.left = `${rect.left + window.scrollX}px`;
      }
    } else {
      rect = element.getBoundingClientRect();
      dropdownElement.style.top = `${rect.bottom + window.scrollY + 4}px`;
      dropdownElement.style.left = `${rect.left + window.scrollX}px`;
    }
    
    // Keep dropdown on screen
    const dropdownRect = dropdownElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    if (dropdownRect.right > viewportWidth) {
      dropdownElement.style.left = `${viewportWidth - dropdownRect.width - 10}px`;
    }
    
    if (dropdownRect.bottom > viewportHeight) {
      const topPos = parseInt(dropdownElement.style.top) - dropdownRect.height - 30;
      dropdownElement.style.top = `${Math.max(10, topPos)}px`;
    }
  } catch (error) {
    console.error('Error positioning dropdown:', error);
  }
}

// Handle keydown events
function handleKeyDown(e) {
  if (!isDropdownOpen) return;
  
  // Don't handle if not arrow keys, enter, tab, or escape
  if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
    return;
  }
  
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      e.stopPropagation();
      selectedIndex = Math.min(selectedIndex + 1, filteredPrompts.length - 1);
      renderDropdown();
      scrollToSelected();
      break;
      
    case 'ArrowUp':
      e.preventDefault();
      e.stopPropagation();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      renderDropdown();
      scrollToSelected();
      break;
      
    case 'Enter':
    case 'Tab':
      if (filteredPrompts.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        selectPrompt(filteredPrompts[selectedIndex]);
      }
      break;
      
    case 'Escape':
      e.preventDefault();
      e.stopPropagation();
      hideDropdown();
      break;
  }
}

// Scroll to selected item in dropdown
function scrollToSelected() {
  if (!dropdownElement) return;
  
  const selectedItem = dropdownElement.querySelector(`[data-index="${selectedIndex}"]`);
  if (selectedItem) {
    selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

// Select and insert prompt
function selectPrompt(prompt) {
  if (!currentElement || !prompt) return;
  
  try {
    const element = currentElement;
    
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      // Standard input handling
      if (triggerStartPosition === null) return;
      
      const text = element.value;
      const cursorPos = element.selectionStart;
      const newValue = text.substring(0, triggerStartPosition) + prompt.content + text.substring(cursorPos);
      
      element.value = newValue;
      const newCursorPos = triggerStartPosition + prompt.content.length;
      element.setSelectionRange(newCursorPos, newCursorPos);
      
      // Trigger events
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // ContentEditable handling
      const selection = window.getSelection();
      
      if (triggerRange) {
        // Use stored range
        selection.removeAllRanges();
        selection.addRange(triggerRange);
        document.execCommand('insertText', false, prompt.content);
      } else {
        // Fallback: insert at current position
        document.execCommand('insertText', false, prompt.content);
      }
    }
    
    hideDropdown();
  } catch (error) {
    console.error('Error inserting prompt:', error);
    hideDropdown();
  }
}

// Handle clicks to close dropdown
function handleClick(e) {
  if (isDropdownOpen && dropdownElement && !dropdownElement.contains(e.target)) {
    hideDropdown();
  }
}

// Handle scroll to reposition dropdown
function handleScroll() {
  if (isDropdownOpen && currentElement) {
    positionDropdown(currentElement);
  }
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Also re-initialize when page content changes (for SPAs like Gemini)
let lastUrl = location.href;
new MutationObserver(() => {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    console.log('PromptSlash: URL changed, re-initializing...');
    // Re-initialize after URL change
    setTimeout(init, 500);
  }
}).observe(document, { subtree: true, childList: true });

// Additional initialization after a delay for slow-loading SPAs
setTimeout(() => {
  if (!dropdownElement || !document.body.contains(dropdownElement)) {
    console.log('PromptSlash: Delayed initialization...');
    init();
  }
}, 2000);