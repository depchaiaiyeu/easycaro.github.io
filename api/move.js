const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

let browser = null;

async function getBrowser() {
    if (!browser) {
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });
    }
    return browser;
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { board, aiMark, humanMark, mode } = req.body;

        if (!board || !aiMark || !humanMark) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const levelMap = {
            'de': 'easy',
            'kho': 'normal',
            'caothu': 'hard'
        };
        const level = levelMap[mode] || 'normal';

        const first = aiMark === 'black' ? 'ai' : 'human';

        const moves = [];
        for (let r = 0; r < board.length; r++) {
            for (let c = 0; c < board[r].length; c++) {
                if (board[r][c] !== null) {
                    moves.push(r * board.length + c + 1);
                }
            }
        }

        const url = `https://depchaiaiyeu.github.io/easycaro.github.io/?level=${level}&first=${first}&moves=${moves.join(',')}`;

        console.log(`Fetching: ${url}`);

        const br = await getBrowser();
        const page = await br.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        await page.goto(url, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        await page.waitForSelector('#game-data-crawler', { timeout: 10000 });

        await page.waitForFunction(
            () => {
                const div = document.getElementById('game-data-crawler');
                return div && div.textContent.trim().length > 0;
            },
            { timeout: 5000 }
        );

        const gameData = await page.evaluate(() => {
            const div = document.getElementById('game-data-crawler');
            if (!div) return null;
            const text = div.textContent.trim();
            if (!text) return null;
            return JSON.parse(text);
        });

        await page.close();

        if (!gameData || !gameData.moves || gameData.moves.length === 0) {
            return res.status(500).json({ error: 'No moves in game data' });
        }

        const lastMoveCell = gameData.moves[gameData.moves.length - 1];
        const movePos = lastMoveCell - 1;
        const row = Math.floor(movePos / board.length);
        const col = movePos % board.length;

        return res.status(200).json({
            move: { row, col },
            cell: lastMoveCell,
            totalMoves: gameData.moves.length
        });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
};
