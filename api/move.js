const BOARD_SIZE = 16;
const BLACK_PLAYER = 'black';
const WHITE_PLAYER = 'white';
const SEARCH_DEPTH = 4;

const SCORES = {
    FIVE: 1000000000,
    LIVE_FOUR: 100000000,
    DEAD_FOUR: 10000000,
    LIVE_THREE: 10000000,
    DEAD_THREE: 100000,
    LIVE_TWO: 10000,
    DEAD_TWO: 1000,
    ONE: 10
};

function getPatternScore(count, openEnds) {
    if (count >= 5) return SCORES.FIVE;
    if (count === 4) {
        if (openEnds >= 1) return SCORES.LIVE_FOUR;
        return SCORES.DEAD_FOUR;
    }
    if (count === 3) {
        if (openEnds === 2) return SCORES.LIVE_THREE;
        if (openEnds === 1) return SCORES.DEAD_THREE;
    }
    if (count === 2) {
        if (openEnds === 2) return SCORES.LIVE_TWO;
        if (openEnds === 1) return SCORES.DEAD_TWO;
    }
    if (count === 1) return SCORES.ONE;
    return 0;
}

function checkLinePattern(board, row, col, dx, dy, player) {
    let count = 1;
    let openEnds = 0;
    
    let r = row + dx;
    let c = col + dy;
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === player) {
        count++;
        r += dx;
        c += dy;
    }
    if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && !board[r][c]) {
        openEnds++;
    }
    
    r = row - dx;
    c = col - dy;
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === player) {
        count++;
        r -= dx;
        c -= dy;
    }
    if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && !board[r][c]) {
        openEnds++;
    }
    
    return { count, openEnds };
}

function evaluatePlayer(board, player) {
    let score = 0;
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
    const visited = new Set();

    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            if (board[row][col] === player) {
                for (const [dx, dy] of directions) {
                    const key = `${row},${col},${dx},${dy}`;
                    if (visited.has(key)) continue;

                    const { count, openEnds } = checkLinePattern(board, row, col, dx, dy, player);
                    score += getPatternScore(count, openEnds);
                    
                    visited.add(key);
                }
            }
        }
    }
    return score;
}

function evaluateBoard(board, aiPlayer, humanPlayer) {
    let score = 0;
    score += evaluatePlayer(board, aiPlayer);
    score -= evaluatePlayer(board, humanPlayer) * 1.5;
    return score;
}

function getCandidateMoves(board) {
    const candidates = new Set();
    const range = 2;
    let hasMoves = false;

    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            if (board[row][col]) {
                hasMoves = true;
                for (let dr = -range; dr <= range; dr++) {
                    for (let dc = -range; dc <= range; dc++) {
                        const newRow = row + dr;
                        const newCol = col + dc;
                        if (newRow >= 0 && newRow < BOARD_SIZE && 
                            newCol >= 0 && newCol < BOARD_SIZE && 
                            !board[newRow][newCol]) {
                            candidates.add(`${newRow},${newCol}`);
                        }
                    }
                }
            }
        }
    }

    if (!hasMoves) {
        return [[Math.floor(BOARD_SIZE / 2), Math.floor(BOARD_SIZE / 2)]];
    }

    return Array.from(candidates).map(pos => pos.split(',').map(Number));
}

function getReflexMove(board, aiPlayer, humanPlayer) {
    const candidates = getCandidateMoves(board);
    
    for (const [row, col] of candidates) {
        board[row][col] = aiPlayer;
        if (isWin(board, row, col, aiPlayer)) {
            board[row][col] = null;
            return { row, col };
        }
        board[row][col] = null;
    }

    for (const [row, col] of candidates) {
        board[row][col] = humanPlayer;
        if (isWin(board, row, col, humanPlayer)) {
            board[row][col] = null;
            return { row, col };
        }
        board[row][col] = null;
    }

    for (const [row, col] of candidates) {
        board[row][col] = aiPlayer;
        if (isLiveFour(board, row, col, aiPlayer)) {
            board[row][col] = null;
            return { row, col };
        }
        board[row][col] = null;
    }

    for (const [row, col] of candidates) {
        board[row][col] = humanPlayer;
        if (isLiveFour(board, row, col, humanPlayer)) {
            board[row][col] = null;
            return { row, col };
        }
        board[row][col] = null;
    }
    
    for (const [row, col] of candidates) {
        board[row][col] = humanPlayer;
        if (isLiveThree(board, row, col, humanPlayer)) {
             board[row][col] = null;
             return { row, col };
        }
        board[row][col] = null;
    }

    return null;
}

function isWin(board, row, col, player) {
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (const [dx, dy] of directions) {
        const { count } = checkLinePattern(board, row, col, dx, dy, player);
        if (count >= 5) return true;
    }
    return false;
}

function isLiveFour(board, row, col, player) {
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (const [dx, dy] of directions) {
        const { count, openEnds } = checkLinePattern(board, row, col, dx, dy, player);
        if (count === 4 && openEnds >= 1) return true;
    }
    return false;
}

function isLiveThree(board, row, col, player) {
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (const [dx, dy] of directions) {
        const { count, openEnds } = checkLinePattern(board, row, col, dx, dy, player);
        if (count === 3 && openEnds === 2) return true;
    }
    return false;
}

function minimax(board, depth, alpha, beta, isMaximizing, aiPlayer, humanPlayer) {
    const evaluation = evaluateBoard(board, aiPlayer, humanPlayer);
    
    if (depth === 0 || Math.abs(evaluation) > SCORES.FIVE / 10) {
        return evaluation;
    }

    const candidates = getCandidateMoves(board);
    if (candidates.length === 0) return 0;

    if (isMaximizing) {
        let maxScore = -Infinity;
        for (const [row, col] of candidates) {
            board[row][col] = aiPlayer;
            const score = minimax(board, depth - 1, alpha, beta, false, aiPlayer, humanPlayer);
            board[row][col] = null;
            maxScore = Math.max(maxScore, score);
            alpha = Math.max(alpha, score);
            if (beta <= alpha) break;
        }
        return maxScore;
    } else {
        let minScore = Infinity;
        for (const [row, col] of candidates) {
            board[row][col] = humanPlayer;
            const score = minimax(board, depth - 1, alpha, beta, true, aiPlayer, humanPlayer);
            board[row][col] = null;
            minScore = Math.min(minScore, score);
            beta = Math.min(beta, score);
            if (beta <= alpha) break;
        }
        return minScore;
    }
}

function getBestMoveMinimax(board, depth, aiPlayer, humanPlayer) {
    let bestScore = -Infinity;
    let bestMove = null;
    const candidates = getCandidateMoves(board);

    if (candidates.length === 0) return null;
    if (candidates.length === 1 && candidates[0][0] === Math.floor(BOARD_SIZE / 2) && candidates[0][1] === Math.floor(BOARD_SIZE / 2)) {
         return { row: candidates[0][0], col: candidates[0][1] };
    }

    for (const [row, col] of candidates) {
        board[row][col] = aiPlayer;
        const score = minimax(board, depth - 1, -Infinity, Infinity, false, aiPlayer, humanPlayer);
        board[row][col] = null;

        if (score > bestScore) {
            bestScore = score;
            bestMove = { row, col };
        }
    }
    return bestMove;
}

function getBestMove(game) {
    const { board, mode, aiMark, humanMark } = game;
    
    const reflexMove = getReflexMove(board, aiMark, humanMark);
    if (reflexMove) {
        return reflexMove;
    }

    if (mode === 'de') {
        const candidates = getCandidateMoves(board);
        return { row: candidates[0][0], col: candidates[0][1] };
    }
    if (mode === 'kho') {
        return getBestMoveMinimax(board, 2, aiMark, humanMark);
    }
    return getBestMoveMinimax(board, SEARCH_DEPTH, aiMark, humanMark);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    try {
        const { board, aiMark, humanMark, mode } = req.body;

        if (!board || !aiMark || !humanMark || !mode) {
            return res.status(400).json({ error: 'Missing required parameters: board, aiMark, humanMark, mode' });
        }

        const game = {
            board: board,
            aiMark: aiMark,
            humanMark: humanMark,
            mode: mode
        };

        const bestMove = getBestMove(game);

        if (bestMove) {
            return res.status(200).json({ move: bestMove });
        } else {
            return res.status(200).json({ move: null, message: "No valid moves found." });
        }

    } catch (error) {
        console.error("Error in Caro AI:", error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
