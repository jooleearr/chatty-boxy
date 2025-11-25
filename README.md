# Gemini File Search Demo

This is a proof of concept application demonstrating the Gemini API's File Search functionality.

## Features

- Creates a file search store
- Uploads a markdown document to the store
- Performs semantic search queries on the uploaded document
- Provides an interactive Q&A mode

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set your Google API key:
   ```bash
   export GOOGLE_API_KEY='your-api-key-here'
   ```
   
   Get your API key from: https://aistudio.google.com/apikey

3. Run the demo:
   ```bash
   node file_search_demo.js
   ```
   
   Or using npm:
   ```bash
   npm start
   ```

## What it Does

The demo will:
1. Create a File Search store in your Google account
2. Upload the `story.md` file (a story about a dog named Biscuit and a rabbit named Clover)
3. Ask several pre-defined questions about the story
4. Enter interactive mode where you can ask your own questions

## Files

- `file_search_demo.js` - Main demo script
- `story.md` - Test document (story about Biscuit and Clover)
- `package.json` - Node.js dependencies and scripts

## Notes

- The File Search store persists after the script ends
- You may want to delete it manually later to avoid storage limits
- The script provides instructions on how to delete the store
