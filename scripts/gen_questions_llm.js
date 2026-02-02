
import fs from 'fs';
import path from 'path';

// --- Configuration ---
// Read from .env file manually or process.env
function loadEnv() {
    try {
        const envPath = path.resolve(process.cwd(), 'temp_know_fun_check', '.env');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf8');
            content.split('\n').forEach(line => {
                const [key, value] = line.split('=');
                if (key && value) process.env[key.trim()] = value.trim();
            });
        }
    } catch (e) { console.log('No .env found or error reading it, using process.env'); }
}
loadEnv();

const API_KEY = process.env.API_KEY;
const API_URL = process.env.API_BASE_URL + '/chat/completions'; // Standard OpenAI format
const MODEL = process.env.LLM_MODEL || 'gpt-3.5-turbo';

if (!API_KEY) {
    console.error("❌ Error: API_KEY is missing. Please set it in .env or environment variables.");
    process.exit(1);
}

// --- Helpers ---
async function callLLM(prompt) {
    console.log(`📡 Calling API [${MODEL}]...`);
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: "system", content: "你是一位专业的初中地理老师。请根据用户提供的教材文本，出几道单项选择题。输出必须是纯 JSON 数组格式。" },
                    { role: "user", content: prompt }
                ],
                temperature: 0.7
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${await response.text()}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        
        // Extract JSON from markdown code blocks if present
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/\[\s*\{[\s\S]*\}\s*\]/);
        const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : content;
        
        return JSON.parse(jsonStr);
    } catch (error) {
        console.error("⚠️ LLM Call Failed:", error.message);
        return [];
    }
}

async function main() {
    const rawTextPath = path.resolve(process.cwd(), 'temp_know_fun_check', 'raw_text.txt');
    if (!fs.existsSync(rawTextPath)) {
        console.error("❌ raw_text.txt not found. Run parse_pdf.js first.");
        return;
    }

    const fullText = fs.readFileSync(rawTextPath, 'utf8');
    
    // Simple Chunking (approx 1000 chars per chunk to fit context and get diverse questions)
    // We will pick 5 random chunks to generate questions from to avoid processing the whole book right now
    const chunkSize = 1500;
    const totalChunks = Math.ceil(fullText.length / chunkSize);
    const selectedChunks = [];
    
    // Pick 5 chunks distributed across the book
    for (let i = 0; i < 5; i++) {
        const start = Math.floor((i / 5) * fullText.length);
        selectedChunks.push(fullText.slice(start, start + chunkSize));
    }

    let allQuestions = [];

    for (const [index, chunk] of selectedChunks.entries()) {
        console.log(`\n📄 Processing Chunk ${index + 1}/5...`);
        const prompt = `
            请阅读以下地理教材片段，并基于此生成 3 道单项选择题。
            
            🔴 核心原则（非常重要）：
            1. **只出地理知识题**：题目必须关于地球、地图、气候、地形、国家等地理事实。
            2. **严禁出“书本周边”题**：绝对不要问“这本书的主编是谁”、“第一章叫什么名字”、“这是哪一页的内容”、“本书由哪个出版社出版”等。如果片段主要是目录或版权页，请直接返回空数组 []，不要强行出题。
            
            要求：
            1. 题目(q)要清晰，适合初中生。
            2. 必须包含正确选项(a)和错误干扰项(b)。
            3. 格式必须为严格的 JSON 数组：
            [
              { "q": "题目描述？", "a": "正确答案", "b": "错误答案", "correct": "A" }
            ]
            
            教材片段：
            ${chunk.replace(/\n/g, ' ').slice(0, 1500)}
        `;

        const questions = await callLLM(prompt);
        if (Array.isArray(questions)) {
            allQuestions = allQuestions.concat(questions);
            console.log(`✅ Got ${questions.length} questions.`);
        }
    }

    // Deduplicate and Save
    const outputPath = path.resolve(process.cwd(), 'temp_know_fun_check', 'questions.json');
    fs.writeFileSync(outputPath, JSON.stringify(allQuestions, null, 2));
    console.log(`\n🎉 Done! Saved ${allQuestions.length} questions to questions.json`);
}

main();
