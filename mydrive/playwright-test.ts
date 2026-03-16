import { chromium } from 'playwright';
import { Document, Packer, Paragraph, TextRun } from "docx";
import * as fs from "fs";

async function createTestDoc() {
    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                new Paragraph({ children: [new TextRun("Hello World test playwright upload!")] }),
            ],
        }],
    });
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync("test.docx", buffer);
    console.log("Created test.docx");
}

(async () => {
    await createTestDoc();
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err));

    console.log("Navigating to login...");
    await page.goto('http://localhost:7860/login');

    await page.fill('input[placeholder="you@example.com"]', 'agent1@test.com');
    await page.fill('input[placeholder="••••••••"]', 'password');
    await page.click('button:has-text("Log in")');
    await page.waitForURL('**/drive');
    console.log("Logged in!");

    // Upload file
    console.log("Uploading test.docx...");
    await page.setInputFiles('input[type="file"]:not([webkitdirectory])', 'test.docx');

    console.log("Waiting for upload to finish...");
    await page.waitForTimeout(2000); // give it 2 seconds to upload

    // Double click the docx file
    console.log("Opening file...");
    await page.dblclick('text=test.docx');

    // Wait for editor page
    await page.waitForURL('**/drive/file/*');
    console.log("Editor loading...");

    // Wait for the editor to load and convert
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'editor-screenshot.png' });
    const editorHTML = await page.evaluate(() => {
        return document.querySelector('.ProseMirror')?.innerHTML || 'Editor not found';
    });
    console.log("EDITOR HTML:", editorHTML);

    await browser.close();
})();
