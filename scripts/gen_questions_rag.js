
import { pipeline } from '@xenova/transformers';
import fs from 'fs';

async function generateQuestions() {
  console.log('Loading extracted text...');
  const text = fs.readFileSync('raw_text.txt', 'utf8');

  // Simple chunking by paragraphs (heuristic)
  // DeepTutor usually uses smarter chunking (recursive char splitter), 
  // but for this Node.js env without LangChain full deps, we do basic semantic splitting.
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.length > 50 && p.length < 500);
  
  console.log(`Found ${paragraphs.length} candidate paragraphs.`);
  
  // Use a smaller, quantized model suitable for CPU execution
  // This simulates the "RAG" retrieval part by selecting high-quality chunks
  // In a real RAG, we would embed these into a Vector DB (like Chroma/Faiss).
  // Here we use a feature-extraction model to score "question-worthiness" or just pick top candidates.
  
  // Since we can't easily run a full LLM (7B+) here for generation, 
  // we will use a QA model to *extract* answers given a generated question template,
  // OR use a summarization model to create the question.
  
  // Let's try a hybrid approach: 
  // 1. Pick paragraphs that contain key geographical terms (keywords).
  // 2. Use simple heuristics to form a "fill-in-the-blank" question.
  
  const keywords = ['地球', '经线', '纬线', '赤道', '公转', '自转', '地图', '海洋', '陆地', '气候'];
  const questions = [];

  // Simulate "Vector Search" by keyword density (tf-idf style lite)
  const rankedParagraphs = paragraphs.map(p => {
    let score = 0;
    keywords.forEach(k => { if(p.includes(k)) score++; });
    return { text: p, score };
  }).sort((a, b) => b.score - a.score).slice(0, 20); // Top 20 chunks

  console.log('Generating questions from top chunks...');

  for (const item of rankedParagraphs) {
    const p = item.text.replace(/\s+/g, ' ').trim();
    
    // Simple Cloze Deletion (Fill in the blank) generation
    // RAG usually retrieves context -> LLM -> Question. 
    // We mock the LLM part with rule-based NLP here.
    
    for (const key of keywords) {
      if (p.includes(key)) {
        // Find a sentence with the keyword
        const sentences = p.split(/[。！？]/);
        const targetSentence = sentences.find(s => s.includes(key) && s.length > 10 && s.length < 60);
        
        if (targetSentence) {
           const qText = targetSentence.replace(key, '____');
           questions.push({
             q: qText + '？',
             a: key,
             b: "（错误干扰项）", // Placeholder, logic to generate distractor would go here
             correct: "A"
           });
           break; // One question per paragraph max
        }
      }
    }
  }

  // Post-processing to add distractors
  questions.forEach(q => {
     // Simple heuristic for distractor: pick another keyword that isn't the answer
     const randomDistractor = keywords.filter(k => k !== q.a)[Math.floor(Math.random() * (keywords.length - 1))];
     q.b = randomDistractor;
  });

  console.log(`Generated ${questions.length} RAG-style questions.`);
  fs.writeFileSync('questions_rag.json', JSON.stringify(questions, null, 2));
}

generateQuestions().catch(console.error);
