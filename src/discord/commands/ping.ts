import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';

import { BOT_VERSION } from '../../config/constants.js';

export const pingCommand = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check whether the bot is running.'),
  async execute(interaction: ChatInputCommandInteraction, environment: string): Promise<void> {
    const startedAt = Date.now();
    await interaction.reply({ content: 'Checking bot status…', ephemeral: true });
    const responseTime = Date.now() - startedAt;

    await interaction.editReply(
      [
        '봇이 정상 작동 중입니다.',
        `응답 시간: ${responseTime}ms`,
        `환경: ${environment}`,
        `버전: ${BOT_VERSION}`,
      ].join('\n'),
    );
  },
};
