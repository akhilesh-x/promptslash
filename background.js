// Service worker for PromptSlash
// Handles extension lifecycle and storage initialization

chrome.runtime.onInstalled.addListener(() => {
  // Initialize storage with demo prompts if empty
  chrome.storage.sync.get(['prompts'], (result) => {
    if (!result.prompts || result.prompts.length === 0) {
      const demoPrompts = [
        {
          id: crypto.randomUUID(),
          shortcut: "sum",
          label: "Summarize",
          content: "Please provide a concise summary of the following:"
        },
        {
          id: crypto.randomUUID(),
          shortcut: "feat",
          label: "Suggest Features",
          content: "Based on the context provided, suggest 5 new features that would enhance this product:"
        }
      ];
      chrome.storage.sync.set({ prompts: demoPrompts });
    }
  });
});
