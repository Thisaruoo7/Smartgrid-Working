const express = require('express');
const path = require('path');
require('dotenv').config(); // Load environment variables from .env file
const { OpenAI } = require('openai'); // Import OpenAI library
const PDFDocument = require('pdfkit'); // Add pdfkit import

const app = express();
const port = 3000;

// --- OpenAI Setup ---
// Ensure the API key is loaded
if (!process.env.OPENAI_API_KEY) {
    console.error('ERROR: OPENAI_API_KEY environment variable not set.');
    console.error('Please create a .env file in the project root and add OPENAI_API_KEY=your_key');
    process.exit(1); // Exit if the key is missing
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
// --- End OpenAI Setup ---

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Route for the root path - serve login.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Placeholder route for the main application page (served statically now)
// We keep this GET route so refreshing /policy-generator works
app.get('/policy-generator', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'policy-generator.html'));
});

// --- API Endpoint for Policy Generation ---
app.post('/generate-policy', async (req, res) => {
    console.log('Received policy generation request:', req.body);
    const { gridSize, country, components, additionalInput } = req.body;

    // Basic validation (can be expanded)
    if (!gridSize || !country || !components || components.length === 0) {
        return res.status(400).json({ error: 'Missing required fields: Grid Size, Country, and at least one Component are required.' });
    }

    // Construct the prompt for OpenAI
    const prompt = `
        Act as a cybersecurity policy expert specializing in Smart Grid infrastructure.
        Generate a cybersecurity policy based on the following parameters:
        - Grid Size: ${gridSize}
        - Country/Region: ${country}
        - Key Components Deployed: ${components.join(', ')}
        ${additionalInput ? `- Additional Requirements/Concerns: ${additionalInput}` : ''}

        The policy should incorporate best practices and controls derived from the following baseline standards and guidelines:
        - NISTIR 7628 Guidelines for Smart Grid Cyber Security
        - IEC 62443 series (Industrial communication networks - Network and system security)
        - ISO/IEC 27019 (Information security controls for the energy utility industry)
        - NERC CIP (Critical Infrastructure Protection) standards (especially relevant for North America, but principles are useful globally)
        - ENISA guidelines for Smart Grids

        After establishing the baseline policy from these standards, critically review it in the context of recent threats and vulnerabilities relevant to the specified components. Reference publicly available databases like CVE (Common Vulnerabilities and Exposures) and NVD (National Vulnerability Database) for this review.

        Identify any gaps or weaknesses in the baseline policy concerning these recent threats and suggest specific, actionable additions or modifications to address them. The output should be a coherent policy document section, not just a list of suggestions.

        Format the output clearly, perhaps using markdown for structure (headings, lists).
        Focus on practical, implementable controls relevant to the specified grid size, components, and country context.
    `;

    try {
        console.log('Sending prompt to OpenAI...');
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: "You are a helpful assistant designing smart grid cybersecurity policies." },
                { role: "user", content: prompt }
            ],
            temperature: 0.5, // Adjust for creativity vs determinism
            // max_tokens: 1500, // Optional: Limit response length
        });

        console.log('Received response from OpenAI.');
        const policy = completion.choices[0]?.message?.content;

        if (policy) {
            console.log("\n--- Raw OpenAI Policy ---");
            console.log(policy);
            console.log("-------------------------\n");

            // --- Clean and Return Plain Text --- 
            const originalLines = policy.split(/\r?\n/);
            let cleanedPlainTextLines = [];

            originalLines.forEach(line => {
                const trimmedOriginal = line.trim();
                // Clean aggressively (handles #, *, +, -, num.)
                console.log(`[Clean] Original: "${trimmedOriginal}"`); 
                const cleanedLine = trimmedOriginal.replace(/^\s*(?:#+|\*|\+|-|\d+\.)\s*/, '');
                console.log(`[Clean] Cleaned:  "${cleanedLine}"`); 
                if (cleanedLine.length > 0) { // Only add non-empty lines
                    cleanedPlainTextLines.push(cleanedLine);
                }
            });

            // Join cleaned plain text lines with standard newlines
            const plainTextPolicy = cleanedPlainTextLines.join('\n');

            console.log("\n--- Cleaned Plain Text Policy ---");
            console.log(plainTextPolicy);
            console.log("---------------------------\n");

            res.json({ policy: plainTextPolicy }); // Send plain text

        } else {
            throw new Error('No policy content received from OpenAI.');
        }

    } catch (error) {
        console.error('Error calling OpenAI API:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to generate policy. Error communicating with OpenAI.' });
    }
});
// --- End API Endpoint ---

// --- New PDF Download Endpoint ---
app.post('/download-policy', (req, res) => {
    let policyToPrint = req.body.policy;

    if (!policyToPrint) {
        return res.status(400).json({ error: 'Policy text is required.' });
    }

    try {
        console.log('Generating simplified PDF...');
        const doc = new PDFDocument();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=generated_policy.pdf');
        doc.pipe(res);

        const pdfLines = policyToPrint.split(/\r?\n/);
        pdfLines.forEach(line => {
            const trimmedLine = line.trim();
            // Clean one last time for safety
            const cleanedPdfLine = trimmedLine.replace(/^\s*(?:#+|\*|\+|-|\d+\.)\s*/, '');
            if (cleanedPdfLine.length > 0) {
                doc.font('Helvetica').fontSize(12);
                doc.text(cleanedPdfLine, { align: 'justify' });
                doc.moveDown(0.5); // Consistent spacing after each line
            }
        });

        doc.end();
        console.log('Simplified PDF sent for download.');

    } catch (error) {
        console.error('Error generating simplified PDF:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to generate PDF.' });
        } else {
             console.error('Could not send PDF error response because headers were already sent.');
        }
    }
});
// --- End PDF Download Endpoint ---

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
