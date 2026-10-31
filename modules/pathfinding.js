import { positionKey } from './utils.js?v=mvvrqkfn';
import { isWalkable } from './map.js?v=mvvrqkfn';

// Shortest walking distance from start to target, or Infinity if it is farther
// than maxDistance. The target tile itself may be occupied (e.g. a monster):
// we only need to be able to walk up to it.
export function pathDistanceWithin(game, start, target, maxDistance) {
    if (start.x === target.x && start.y === target.y) return 0;
    const queue = [{ x: start.x, y: start.y, distance: 0 }];
    const visited = new Set([positionKey(start.x, start.y)]);
    for (let index = 0; index < queue.length; index++) {
        const current = queue[index];
        if (current.distance >= maxDistance) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const x = current.x + dx;
            const y = current.y + dy;
            if (x === target.x && y === target.y) return current.distance + 1;
            const key = positionKey(x, y);
            if (!isWalkable(game, x, y) || visited.has(key)) continue;
            visited.add(key);
            queue.push({ x, y, distance: current.distance + 1 });
        }
    }
    return Infinity;
}
