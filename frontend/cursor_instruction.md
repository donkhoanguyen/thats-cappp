# That's Cappp Frontend Documentation

## Project Structure
```
frontend/
├── manifest.json          # Chrome extension manifest
├── content/              # Content scripts
│   └── content.js        # Main content script
├── background/           # Background scripts
│   └── background.js     # Background service worker
├── components/           # UI components
│   ├── floating-button/  # Floating action button
│   ├── popup/           # Popup component
│   └── sidepanel/       # Side panel component
└── icons/               # Extension icons
```

## Component Architecture

### 1. Floating Button
- Located at `components/floating-button/`
- Creates a draggable floating action button
- Positioned at the right side of the screen
- Clicking the first 50px triggers the popup
- Rest of the button area is draggable

### 2. Popup Component
- Located at `components/popup/`
- Appears when clicking the floating button
- Features:
  - Purple header with logo
  - "Concepts" title
  - Context input field
  - "Start Listening" button
- Styling:
  - Width: 340px
  - Height: 272px
  - Purple theme (#7c3aed)
  - Smooth animations
  - Box shadow and rounded corners
- Behavior:
  - Positions relative to floating button
  - Closes on outside click
  - Supports Enter key
  - Shows/hides floating button

### 3. Side Panel
- Located at `components/sidepanel/`
- Appears after popup submission
- Features:
  - Header with close button
  - Content area for analysis results
  - Recording functionality
- Styling:
  - Slides in from right
  - Full height
  - Clean, modern design

## Key Implementation Details

### 1. Module System
- Uses ES modules for better code organization
- Components are loaded dynamically using `chrome.runtime.getURL()`
- Each component is self-contained with its own HTML, CSS, and JS

### 2. Event Flow
1. User clicks floating button (first 50px)
2. Popup appears with context input
3. User enters context and clicks "Start Listening"
4. Side panel appears
5. Content is sent to FastAPI backend
6. Results are displayed in side panel

### 3. Styling Approach
- Component-scoped CSS
- Modern design with:
  - Purple theme (#7c3aed)
  - Smooth animations
  - Box shadows
  - Rounded corners
  - Clean typography
- Responsive positioning
- Z-index management for proper layering

### 4. Chrome Extension Specifics
- Manifest V3 configuration
- Content script injection
- Background service worker
- Web accessible resources
- Module support in content scripts

## Best Practices Implemented

1. **Code Organization**
   - Modular component structure
   - Separation of concerns
   - Clear file naming
   - Consistent directory structure

2. **Performance**
   - Lazy loading of components
   - Efficient event handling
   - Smooth animations
   - Proper cleanup on component removal

3. **User Experience**
   - Intuitive interaction flow
   - Responsive feedback
   - Smooth transitions
   - Error handling

4. **Maintainability**
   - Clear component interfaces
   - Consistent styling patterns
   - Well-documented code
   - Reusable components

## Common Issues and Solutions

1. **Module Loading**
   - Use `chrome.runtime.getURL()` for dynamic imports
   - Add files to `web_accessible_resources` in manifest
   - Set `"type": "module"` in content scripts

2. **Z-index Management**
   - Popup: 2147483646
   - Floating button: 2147483647
   - Side panel: 2147483645

3. **Event Handling**
   - Use event delegation where appropriate
   - Clean up event listeners on component removal
   - Handle edge cases (outside clicks, key presses)

4. **Styling Conflicts**
   - Use specific class names
   - Scope styles to components
   - Avoid global styles
   - Use BEM-like naming convention

## Future Considerations

1. **State Management**
   - Consider implementing a state management system
   - Handle component communication more elegantly
   - Add persistence for user preferences

2. **Error Handling**
   - Implement more robust error handling
   - Add user-friendly error messages
   - Improve error recovery

3. **Testing**
   - Add unit tests for components
   - Implement integration tests
   - Add end-to-end testing

4. **Accessibility**
   - Add ARIA labels
   - Improve keyboard navigation
   - Add screen reader support

## Development Workflow

1. **Adding New Components**
   - Create component directory in `components/`
   - Add HTML, CSS, and JS files
   - Update manifest.json if needed
   - Import and use in content.js

2. **Modifying Existing Components**
   - Update component files
   - Test in isolation
   - Verify integration with other components
   - Check for side effects

3. **Debugging**
   - Use Chrome DevTools
   - Check console for errors
   - Verify manifest configuration
   - Test in different contexts

4. **Deployment**
   - Update version in manifest.json
   - Test in Chrome
   - Package extension
   - Submit to Chrome Web Store
