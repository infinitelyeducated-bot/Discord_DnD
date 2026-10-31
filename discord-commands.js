// Discord command layer for Discord D&D — server side.
// Slash commands + clickable buttons, with the names/roles assigned before the
// game begins. The DM's page executes the actions; this file only mediates.
//
// Commands:
//   /join            → open the role-picker message (buttons per party slot)
//   /setup, /rejoin  → same picker (shown at game start automatically)
//   /help            → command list
//   /roll d20+…      → dice roll, results posted to the channel
//
// The word "clickable" is Discord's own UX: we post a message with Buttons,
// and every interaction is handled through interactionCreate.

import {
    Client, GatewayIntentBits,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder
} from 'discord.js';

export function buildCommandLayer(client, { channelId, relayPages }) {
    const getChannel = typeof channelId === 'function' ? channelId : () => channelId;
    const state = {
        // map discordUserId -> character slot (name)
        assignments: new Map(),
        pickers: new Map(),      // customId -> { members: [{name, color}] }
        started: false
    };

    // ——— slash commands ———
    const commands = [
        new SlashCommandBuilder().setName('join').setDescription('Claim your character slot (opens the role picker).'),
        new SlashCommandBuilder().setName('setup').setDescription('Reopen the role picker.'),
        new SlashCommandBuilder().setName('help').setDescription('List clickable actions.'),
        new SlashCommandBuilder().setName('roll').setDescription('Roll dice (e.g. /roll 2d6+2)')
            .addStringOption(o => o.setName('dice').setDescription('e.g. 1d20, 2d6+2').setRequired(true))
    ];

    client.application.commands.set(commands).then(() => {
        console.log('Discord command layer: slash commands registered');
    }).catch(e => console.log('command register failed: ' + e.message));

    // ——— role picker (buttons; only unclaimed slots are offered) ———
    function openRolePicker({ targetUserId = null, channel = null } = {}) {
        const members = lastKnownParty();
        if (!members || !members.length) {
            postPlain(channel || getChannel(), 'No party has been set up yet. The DM must open the game first.');
            return;
        }
        const unclaimed = members.filter(m => !state.assignments.has(m.name));
        if (!unclaimed.length) {
            postPlain(channel || getChannel(), 'Every slot is already claimed. Use /rejoin if you need to change.');
            return;
        }
        const row = new ActionRowBuilder().addComponents(
            unclaimed.slice(0, 5).map(m => new ButtonBuilder()
                .setCustomId('pick:' + m.name)
                .setLabel(m.name + ' (' + m.className + ')')
                .setStyle(ButtonStyle.Primary))
        );
        const picker = { members: unclaimed, createdAt: Date.now() };
        state.pickers.set('pick:' + unclaimed[0].name, picker);
        post(channel || getChannel(), { content: '**Choose your character:**', components: [row], flags: 1 << 6 }); // EPHEMERAL(64)
    }

    // ——— interaction handler ———
    client.on('interactionCreate', async interaction => {
        try {
            if (interaction.isChatInputCommand()) {
                const name = interaction.commandName;
                if (name === 'help') {
                    await interaction.reply({ content: '**Clickable actions:** `/join` (role picker), `/setup` (reopen), `/roll 2d6` — and the DM game posts action buttons when it is your turn.', ephemeral: true });
                } else if (name === 'roll') {
                    const dice = interaction.options.getString('dice') || '1d20';
                    const m = /^(\d+)d(\d+)([+-]\d+)?$/i.exec(dice.trim());
                    if (!m) { await interaction.reply({ content: 'Format: `1d20`, `2d6+2`.', ephemeral: true }); return; }
                    const n = Math.min(20, parseInt(m[1])), die = Math.min(1000, parseInt(m[2])), mod = m[3] ? parseInt(m[3]) : 0;
                    const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * die));
                    const total = rolls.reduce((a, b) => a + b, 0) + mod;
                    await interaction.reply({ content: `🎲 **${interaction.user.displayName}** \`${dice}\` → [${rolls.join(', ')}] = **${total}**` });
                    broadcastToPages({ type: 'discordRoll', sender: interaction.user.displayName, dice, rolls, total });
                } else if (name === 'join' || name === 'setup') {
                    // clickable role picker
                    const members = lastKnownParty();
                    const unclaimed = members ? members.filter(m => !state.assignments.has(m.name)) : [];
                    if (!unclaimed.length) { await interaction.reply({ content: 'All slots claimed. Use /rejoin to change.', ephemeral: true }); return; }
                    const row = new ActionRowBuilder().addComponents(
                        unclaimed.slice(0, 5).map(m => new ButtonBuilder().setCustomId('pick:' + m.name).setLabel(m.name).setStyle(ButtonStyle.Primary))
                    );
                    await interaction.reply({ content: '**Choose your character:**', components: [row], ephemeral: true });
                }
                return;
            }
            if (interaction.isButton()) {
                if (interaction.customId.startsWith('pick:')) {
                    const charName = interaction.customId.slice(5);
                    if (state.assignments.has(charName)) {
                        await interaction.reply({ content: 'That slot is already taken.', ephemeral: true });
                        return;
                    }
                    state.assignments.set(charName, interaction.user.id);
                    // rename: use the player's Discord name for the character
                    broadcastToPages({ type: 'discordAssign', charName, discUserId: interaction.user.id, discName: interaction.user.displayName || interaction.user.username });
                    await interaction.update({
                        content: `✅ ${interaction.user.displayName} took **${charName}**.`,
                        components: []
                    });
                    postPlain(getChannel(), `**${interaction.user.displayName}** claims **${charName}** — named after them now.`);
                } else if (interaction.customId.startsWith('act:')) {
                    const action = interaction.customId.slice(4);
                    broadcastToPages({ type: 'discordAction', discUserId: interaction.user.id, action, label: interaction.user.displayName });
                    await interaction.reply({ content: 'Command sent.', ephemeral: true });
                }
            }
        } catch (e) {
            console.log('interaction error: ' + e.message);
            try { await interaction.reply({ content: 'Something went wrong.', ephemeral: true }); } catch {}
        }
    });

    // ——— helpers ———
    function lastKnownParty() {
        return globalThis.__partySlots || null;
    }
    function post(channel, payload) {
        client.channels.fetch(channel).then(c => c.isSendable && c.send(payload)).catch(() => {});
    }
    function postPlain(channel, text) {
        if (!channel) return;
        client.channels.fetch(channel).then(c => c.isSendable && c.send(text)).catch(() => {});
    }
    function broadcastToPages(payload) {
        for (const ws of relayPages) { try { ws.send(JSON.stringify(payload)); } catch {} }
    }

    return state;
}
