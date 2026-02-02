const fs = require('fs');

// Read the raw text
const rawText = fs.readFileSync('raw_text.txt', 'utf8');

// This is a simplified regex-based extractor.
// Real textbooks are messy, so we look for patterns like:
// 1. Questions ending with ? or ？
// 2. Sentences containing "是" or "叫" or "位于" (defining facts)
// 3. Numbered lists (though PDF text often loses formatting)

// We will attempt to generate Fill-in-the-Blank or Multiple Choice questions
// by identifying key terms (nouns, places, numbers).

const questions = [];

// Split by lines and filter empty
const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 10);

// Basic extraction logic (Heuristic)
lines.forEach(line => {
    // skip table of contents or useless headers
    if (line.includes('目录') || line.includes('Unit') || line.match(/^[0-9]+$/)) return;

    // Pattern 1: Definitions (A 是 B)
    // Extract definitions to create "What is A?" -> B
    const defMatch = line.match(/([^，。]+)(是指|叫做|是)([^，。]+)[。]/);
    if (defMatch) {
        const subject = defMatch[1];
        const predicate = defMatch[3];
        if (subject.length < 15 && predicate.length < 15) {
            questions.push({
                q: `${subject}是什么？`,
                a: predicate,
                b: generateDistractor(predicate),
                correct: "A"
            });
        }
    }

    // Pattern 2: Facts with numbers
    const numMatch = line.match(/([^，。]+)(\d+%|\d+千米|\d+亿)([^，。]*)[。]/);
    if (numMatch) {
        const fact = numMatch[1] + "___" + numMatch[3];
        questions.push({
            q: fact.replace('___', '多少？'),
            a: numMatch[2],
            b: generateDistractorNumber(numMatch[2]),
            correct: "A"
        });
    }
});

// Helper to generate wrong answers
function generateDistractor(text) {
    return "不" + text; // Very dumb distractor, need AI for better ones
}

function generateDistractorNumber(numStr) {
    // If percentage, return random %
    if (numStr.includes('%')) return Math.floor(Math.random() * 100) + "%";
    // If number, add/sub random
    const num = parseFloat(numStr);
    return (num * 1.5).toFixed(0) + (numStr.replace(/[0-9.]/g, ''));
}

// Randomize and limit
const uniqueQuestions = questions.slice(0, 50); // Limit to 50

console.log(JSON.stringify(uniqueQuestions, null, 2));
