enum ChatRole { user, assistant }

class ChatCitation {
  const ChatCitation({required this.title, this.sourceUrl, this.section});

  factory ChatCitation.fromJson(Map<String, dynamic> json) => ChatCitation(
    title: json['title'] as String,
    sourceUrl: json['source_url'] as String?,
    section: json['section'] as String?,
  );

  final String title;
  final String? sourceUrl;
  final String? section;
}

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.role,
    required this.content,
    required this.createdAt,
    this.citations = const [],
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
    id: json['id'] as String,
    role: ChatRole.values.byName(json['role'] as String),
    content: json['content'] as String,
    createdAt: DateTime.parse(json['created_at'] as String),
    citations: (json['citations'] as List<dynamic>? ?? const [])
        .map((item) => ChatCitation.fromJson(item as Map<String, dynamic>))
        .toList(growable: false),
  );

  final String id;
  final ChatRole role;
  final String content;
  final DateTime createdAt;
  final List<ChatCitation> citations;
}

class ChatState {
  const ChatState({
    this.sessionId,
    this.messages = const [],
    this.isLoading = false,
    this.error,
  });

  final String? sessionId;
  final List<ChatMessage> messages;
  final bool isLoading;
  final String? error;

  ChatState copyWith({
    String? sessionId,
    List<ChatMessage>? messages,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) => ChatState(
    sessionId: sessionId ?? this.sessionId,
    messages: messages ?? this.messages,
    isLoading: isLoading ?? this.isLoading,
    error: clearError ? null : error ?? this.error,
  );
}
