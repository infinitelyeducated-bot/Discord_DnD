export function createLogger(gameLog, render) {
    return function logMessage(message, member = null, actorName = 'Dungeon') {
        const record = {
            timestamp: new Date().toLocaleTimeString(),
            memberId: member?.id ?? null,
            actorName: member ? member.name : actorName,
            message
        };
        gameLog.push(record);
        while (gameLog.length > 200) gameLog.shift();
        if (render) render(record);
    };
}
