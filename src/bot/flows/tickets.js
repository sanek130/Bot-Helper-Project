import { TicketModel } from '../../db/models/Ticket.js';

// === СОЗДАНИЕ ТИКЕТА (/support) ===
export async function handleSupportCommand(userId, tgId, text) {
  try {
    const parts = text.split('\n').slice(1).map(line => line.trim()).filter(Boolean);
    if (parts.length < 2) return { success: false, error: 'Необходимо указать тему и описание проблемы' };

    const subject = parts[0];
    const message = parts.slice(1).join('\n');

    const ticket = await TicketModel.create({
      userId,
      tgId,
      subject,
      message,
    });

    return { success: true, ticketId: ticket._id, message: `Тикет создан! ID: ${ticket._id.slice(0, 8)}...` };
  } catch (error) {
    console.error('Ошибка создания тикета:', error);
    return { success: false, error: 'Ошибка при создании тикета' };
  }
}

// === ПРОСМОТР ТИКЕТОВ (/tickets) ===
export async function getOpenTickets(userId) {
  try {
    const tickets = await TicketModel.find({ userId })
      .populate('userId', 'firstName lastName username')
      .sort({ createdAt: -1 });

    return { success: true, tickets };
  } catch (error) {
    console.error('Ошибка получения тикетов:', error);
    return { success: false, error: 'Не удалось получить тикеты' };
  }
}

// === ПРОСМОТР ТИКЕТА ПО ID (/ticket <id>) ===
export async function getTicketById(ticketId) {
  try {
    const ticket = await TicketModel.findById(ticketId)
      .populate('userId', 'firstName lastName username notificationName')
      .populate({
        path: 'replies.authorId',
        select: 'firstName lastName username',
      });

    if (!ticket) return null;

    return { success: true, ticket };
  } catch (error) {
    console.error('Ошибка получения тикета:', error);
    return null;
  }
}

// === ВОЗВРАТ ВСЕХ ТИКЕТОВ (для админов) (/admin tickets) ===
export async function getAllTickets() {
  try {
    const tickets = await TicketModel.find({})
      .populate('userId', 'firstName lastName username notificationName')
      .populate({
        path: 'replies.authorId',
        select: 'firstName lastName username',
      })
      .sort({ createdAt: -1 });

    return { success: true, tickets };
  } catch (error) {
    console.error('Ошибка получения всех тикетов:', error);
    return null;
  }
}

// === ОТВЕТ НА ТИКЕТ (/reply <id> <сообщение>) ===
export async function replyToTicket(ticketId, userId, text) {
  try {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) return null;

    const reply = await TicketModel.updateOne(
      { _id: ticketId },
      { $push: { replies: { authorId: userId, text } } }
    );

    const updatedTicket = await TicketModel.findById(ticketId).populate('userId', 'firstName lastName username notificationName');

    return { success: true, ticket: updatedTicket };
  } catch (error) {
    console.error('Ошибка ответа на тикет:', error);
    return null;
  }
}

// === ЗАКРЫТИЕ ТИКЕТА (/close <id>) ===
export async function closeTicket(ticketId) {
  try {
    await TicketModel.updateOne({ _id: ticketId }, { $set: { status: 'resolved' } });
    return { success: true, message: 'Тикет закрыт' };
  } catch (error) {
    console.error('Ошибка закрытия тикета:', error);
    return null;
  }
}