#!/usr/bin/env node
/**
 * Gemini File Search API Demo
 * This script demonstrates how to:
 * 1. Create a file search store
 * 2. Upload a file to the store
 * 3. Query the file search store with questions
 */

import { GoogleGenAI } from '@google/genai';
import * as readline from 'readline';
import * as path from 'path';
import { fileURLToPath } from 'url';

async function main() {
  // Initialize the Gemini client
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error('Error: GOOGLE_API_KEY environment variable not set');
    console.error('Please set it with: export GOOGLE_API_KEY="your-api-key"');
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });

  console.log('=== Gemini File Search Demo ===\n');

  // Step 1: Create the File Search store
  console.log('Step 1: Creating File Search store...');

  const fileSearchStore = await ai.fileSearchStores.create({
    config: { displayName: 'chatty-boxy-demo-store' }
  });

  console.log(`✓ Created store: ${fileSearchStore.name}\n`);

  // Step 2: Upload and import file to File Search store
  console.log('Step 2: Uploading file to File Search store...');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const filePath = path.join(__dirname, 'story.md');

  let operation = await ai.fileSearchStores.uploadToFileSearchStore({
    file: filePath,
    fileSearchStoreName: fileSearchStore.name,
    config: {
      displayName: 'Biscuit and Clover Story',
      mimeType: 'text/markdown',
    }
  });

  // Wait for import operation to complete
  console.log('  Waiting for file import to complete...');
  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    operation = await ai.operations.get({ operation });
  }

  console.log('✓ File uploaded and imported successfully\n');

  // Step 3: Ask questions about the file
  console.log('Step 3: Querying the File Search store...\n');

  const questions = [
    "What are the names of the main characters in this story?",
    "How did Biscuit and Clover first meet?",
    "What is the secret garden and who are its guardians?",
  ];

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    console.log(`Question ${i + 1}: ${question}`);
    console.log('-'.repeat(80));

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: question,
      config: {
        tools: [
          {
            fileSearch: {
              fileSearchStoreNames: [fileSearchStore.name]
            }
          }
        ]
      }
    });

    console.log(`Answer: ${response.text}\n`);
  }

  // Interactive mode
  console.log('\n' + '='.repeat(80));
  console.log('Interactive mode - Ask your own questions!');
  console.log("Type 'quit' or 'exit' to end");
  console.log('='.repeat(80) + '\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const askQuestion = () => {
    rl.question('Your question: ', async (userQuestion) => {
      const trimmed = userQuestion.trim();

      if (trimmed.toLowerCase() === 'quit' || trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'q') {
        rl.close();
        console.log('\n=== Demo complete! ===');
        console.log(`\nNote: File Search store '${fileSearchStore.name}' has been created.`);
        console.log('The data will persist until you manually delete it.');
        console.log(`To delete it later, make a DELETE request to:`);
        console.log(`https://generativelanguage.googleapis.com/v1beta/${fileSearchStore.name}?force=true`);
        return;
      }

      if (trimmed) {
        console.log();
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: trimmed,
          config: {
            tools: [
              {
                fileSearch: {
                  fileSearchStoreNames: [fileSearchStore.name]
                }
              }
            ]
          }
        });
        console.log(`Answer: ${response.text}\n`);
      }

      askQuestion();
    });
  };

  askQuestion();
}

main().catch(console.error);
