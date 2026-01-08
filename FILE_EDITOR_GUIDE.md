# File Viewer & Editor - Testing Guide

## Features Implemented

### 1. Backend File Operations
- **Read Files**: `GET /api/servers/:id/files/read?path=<filepath>`
- **Write Files**: `POST /api/servers/:id/files/write` with `{ path, content }`
- Both endpoints are protected with authentication and server ownership validation

### 2. Frontend Components

#### FileEditor Component
A full-featured code editor with:
- Syntax highlighting support (basic)
- Line and character count
- Auto-save indicator
- Keyboard shortcuts (Ctrl+S / Cmd+S to save)
- Unsaved changes warning
- Success/error notifications
- File extension badge

#### Updated FileBrowser Component
- Click on any file to open it in the editor
- Click on directories to navigate
- Files show hover effects to indicate they're clickable
- Opens editor in a full-screen modal

### 3. API Service
Updated `filesService` with:
- `writeFile(serverId, path, content)` method

## How to Test

### Start the Application
```bash
# In project root
npm run dev
```

This will start both:
- Backend API on http://localhost:3044
- Frontend on http://localhost:3000

### Test the File Editor

1. **Navigate to a Server**
   - Go to your Servers page
   - Click on any server to view details
   - You should see the File Browser

2. **Browse Files**
   - The file browser shows the directory structure
   - Click on folders to navigate deeper
   - Click on any file to open the editor

3. **Edit a File**
   - Click on a text file (e.g., `.js`, `.txt`, `.json`, `.conf`)
   - The file opens in a full-screen modal editor
   - Make changes to the content
   - Notice the "● Unsaved changes" indicator appears

4. **Save Changes**
   - Click the "Save" button, OR
   - Press `Ctrl+S` (Windows/Linux) or `Cmd+S` (Mac)
   - You'll see a "✓ Saved" success message
   - The unsaved indicator disappears

5. **Close the Editor**
   - Click the "✕" button
   - If you have unsaved changes, you'll get a confirmation dialog
   - The editor closes and returns to the file browser

## Features to Note

### Visual Indicators
- **Unsaved changes**: Orange pulsing dot with text
- **Save success**: Green checkmark
- **Save error**: Red X with error message
- **File extension badge**: Shows file type (JS, TXT, etc.)

### File Stats
- Line count displayed in footer
- Character count displayed in footer
- Current file path shown in header

### Safety Features
- Confirms before closing with unsaved changes
- Shows save status clearly
- Error handling for read/write failures
- Authentication required for all operations

### Modal Behavior
- Full-screen editor (95% viewport)
- Dark theme matching the app
- Click outside to close (with unsaved changes warning)
- Escape key to close (with warning if dirty)

## Keyboard Shortcuts
- `Ctrl+S` / `Cmd+S` - Save file
- `Tab` - Insert tab (2 spaces)

## Technical Details

### File Size Limits
- Currently no explicit size limit
- Large files may take longer to load/save
- Consider adding file size warnings for files > 1MB

### Supported File Types
- Any text-based file can be edited
- Binary files will show garbled text (not recommended to edit)
- Common text files: `.js`, `.json`, `.txt`, `.md`, `.css`, `.html`, `.conf`, `.env`, etc.

### Error Handling
- Network errors are caught and displayed
- File not found errors are handled
- Permission errors are shown to user
- Backend SSH connection errors are surfaced

## Future Enhancements (Optional)

Consider adding:
1. Syntax highlighting library (e.g., Monaco Editor, CodeMirror)
2. Line numbers
3. Search and replace
4. Multiple file tabs
5. File size warnings
6. Auto-save functionality
7. File diff/comparison view
8. Read-only mode for system files

## Troubleshooting

### Editor won't open
- Check browser console for errors
- Verify server is running and accessible
- Check that you're authenticated

### Can't save files
- Verify file permissions on the remote server
- Check SSH connection is active
- Look for errors in backend logs

### Modal doesn't display correctly
- Clear browser cache
- Check for CSS conflicts
- Verify Modal component is rendering

### Performance issues
- Consider file size limitations
- Check network latency to server
- Monitor backend SSH connection pool
