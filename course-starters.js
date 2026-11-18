// course-starters.js — ready-made courses to start from in the maze, the puck course and the room
// (design/evals-course.md, "Starter courses"). The owner's call (2026-11-17, after playing a blank field with every
// part open: "hard to choose ... no direction"): a few to pick from in each kind. Each names the step of the kind's
// unlock ladder it needs (`needs`, as the parts' own `needs` count), so with the unlocks on you are only offered what
// you could build yourself. tests/course-starters.test.js holds every one to being clearable.
// Pure data: window.CourseStarters / require(). EVERY COURSE AND NAME IS A PLACEHOLDER.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api; else root.CourseStarters = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    // Parts as [tile, column, row], columns from the left and rows from the top, both from 0.
    const STARTERS = {
        // 7 x 9; you start bottom left, the exit is top right.
        maze: [
            { name: 'First steps', needs: 0, parts: [['wall', 1, 7], ['wall', 2, 7], ['wall', 3, 7], ['wall', 4, 7], ['wall', 5, 7], ['trap', 6, 6], ['wall', 1, 5], ['wall', 2, 5], ['wall', 3, 5], ['wall', 4, 5], ['wall', 5, 5], ['wall', 6, 5], ['trap', 0, 4], ['wall', 0, 2], ['wall', 1, 2], ['wall', 2, 2], ['wall', 3, 2], ['wall', 4, 2], ['trap', 5, 1]] },
            { name: 'Night watch', needs: 1, parts: [['wall', 1, 7], ['wall', 2, 7], ['wall', 4, 7], ['wall', 5, 7], ['wall', 6, 7], ['patrol', 3, 6], ['wall', 0, 5], ['wall', 1, 5], ['wall', 2, 5], ['wall', 4, 5], ['wall', 5, 5], ['trap', 3, 4], ['patrol', 2, 3], ['wall', 1, 2], ['wall', 2, 2], ['wall', 3, 2], ['wall', 5, 2], ['wall', 6, 2], ['trap', 4, 1]] },
            { name: 'Lock and key', needs: 2, parts: [['wall', 0, 6], ['wall', 1, 6], ['wall', 2, 6], ['wall', 3, 6], ['wall', 4, 6], ['wall', 5, 6], ['key', 6, 8], ['trap', 4, 8], ['patrol', 3, 7], ['door', 6, 6], ['wall', 1, 3], ['wall', 2, 3], ['wall', 3, 3], ['wall', 4, 3], ['wall', 5, 3], ['wall', 6, 3], ['trap', 0, 3]] },
        ],
        // 7 x 9; the tee is bottom middle, the hole top middle.
        puck: [
            { name: 'First bank', needs: 0, parts: [['wall', 2, 4], ['wall', 3, 4], ['wall', 4, 4], ['target', 5, 6], ['target', 1, 2], ['bumper0', 6, 3]] },
            { name: 'Slow lane', needs: 1, parts: [['wall', 0, 5], ['wall', 1, 5], ['wall', 2, 5], ['wall', 3, 5], ['sand', 5, 5], ['sand', 6, 5], ['mover', 3, 3], ['target', 0, 7], ['target', 6, 1], ['bumper1', 0, 0]] },
            { name: 'Shortcut', needs: 4, parts: [['wall', 1, 4], ['wall', 2, 4], ['wall', 3, 4], ['wall', 4, 4], ['wall', 5, 4], ['pit', 0, 4], ['portal', 0, 7], ['portal', 6, 1], ['booster0', 6, 6], ['ice', 6, 5], ['mover', 2, 2], ['target', 1, 6], ['target', 5, 2]] },
        ],
        // 12 x 7; you start bottom left, the flag is on the ledge top right. The floor is the bottom row.
        rooms: [
            { name: 'Stairs', needs: 0, parts: [['spike', 2, 5], ['block', 4, 5], ['spike', 6, 5], ['block', 8, 5], ['block', 8, 4], ['block', 9, 4], ['block', 9, 3]] },
            { name: 'Mind the gap', needs: 1, parts: [['block', 3, 5], ['pit', 5, 6], ['pit', 6, 6], ['block', 7, 5], ['block', 7, 4], ['spike', 8, 5], ['block', 9, 4], ['block', 9, 3]] },
            { name: 'Workshop', needs: 3, parts: [['boost', 2, 5], ['pit', 4, 6], ['pit', 5, 6], ['saw', 6, 3], ['block', 7, 5], ['spring', 8, 5], ['spike', 9, 5]] },
        ],
    };
    // A starter as the kind's own list of cells. `R`: that kind's rules (maze.js, puck.js, rooms.js).
    function build(kind, i, R) {
        const s = STARTERS[kind] && STARTERS[kind][i];
        if (!s) return null;
        const cols = (R.MAZE || R.PUCK || R.ROOM).cols, cells = (R.emptyMaze || R.emptyCourse || R.emptyRoom)();
        for (const [tile, x, y] of s.parts) cells[y * cols + x] = tile;
        return (R.cleanMaze || R.cleanCourse || R.cleanRoom)(cells);
    }
    // The starters you may pick at a step of the kind's ladder: [{ index, name }].
    const offered = (kind, level) => (STARTERS[kind] || []).map((s, index) => ({ index, name: s.name, needs: s.needs })).filter(s => s.needs <= level);
    return { STARTERS, build, offered };
});
