import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../data/chat_api.dart';
import '../domain/chat_models.dart';
import '../su_chat_configuration.dart';

final suChatConfigurationProvider = Provider<SuChatConfiguration>(
  (ref) =>
      throw StateError('Override suChatConfigurationProvider in the host app'),
);

final chatApiProvider = Provider<ChatApi>(
  (ref) => ChatApi(ref.watch(suChatConfigurationProvider)),
);

final chatControllerProvider =
    NotifierProvider.autoDispose<ChatController, ChatState>(ChatController.new);

class ChatController extends Notifier<ChatState> {
  late ChatApi _api;
  late SuChatConfiguration _configuration;

  @override
  ChatState build() {
    _api = ref.watch(chatApiProvider);
    _configuration = ref.watch(suChatConfigurationProvider);
    Future.microtask(initialize);
    return const ChatState(isLoading: true);
  }

  Future<void> initialize() async {
    try {
      final (id, messages) = await _api.openSession(
        _configuration.initialSessionId,
      );
      _configuration.onSessionChanged?.call(id);
      if (!ref.mounted) return;
      state = ChatState(sessionId: id, messages: messages);
    } catch (error) {
      if (ref.mounted) state = ChatState(error: error.toString());
    }
  }

  Future<void> send(String rawContent) async {
    final content = rawContent.trim();
    if (content.isEmpty || state.isLoading || state.sessionId == null) return;
    final optimistic = ChatMessage(
      id: const Uuid().v4(),
      role: ChatRole.user,
      content: content,
      createdAt: DateTime.now().toUtc(),
    );
    state = state.copyWith(
      messages: [...state.messages, optimistic],
      isLoading: true,
      clearError: true,
    );
    try {
      final answer = await _api.send(state.sessionId!, content);
      if (ref.mounted) {
        state = state.copyWith(
          messages: [...state.messages, answer],
          isLoading: false,
        );
      }
    } catch (error) {
      if (ref.mounted)
        state = state.copyWith(isLoading: false, error: error.toString());
    }
  }
}
