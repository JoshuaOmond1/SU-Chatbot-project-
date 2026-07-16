import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:speech_to_text/speech_to_text.dart';

import '../application/chat_controller.dart';
import '../domain/chat_models.dart';

const _deepGreen = Color(0xFF004F3C);
const _suGreen = Color(0xFF006A4E);
const _suBlue = Color(0xFF155FA0);
const _suGold = Color(0xFFF4B41A);
const _canvas = Color(0xFFF3F7F5);
const _ink = Color(0xFF17231E);
const _muted = Color(0xFF6C7B74);

class SuChatPage extends ConsumerStatefulWidget {
  const SuChatPage({super.key, this.title = 'SU Assistant'});

  final String title;

  @override
  ConsumerState<SuChatPage> createState() => _SuChatPageState();
}

class _SuChatPageState extends ConsumerState<SuChatPage> {
  final _textController = TextEditingController();
  final _scrollController = ScrollController();
  final _focusNode = FocusNode();
  final _speech = SpeechToText();
  bool _listening = false;

  @override
  void dispose() {
    _speech.stop();
    _textController.dispose();
    _scrollController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 260),
          curve: Curves.easeOutCubic,
        );
      }
    });
  }

  void _selectSuggestion(String value) {
    _textController.text = value;
    _textController.selection = TextSelection.collapsed(offset: value.length);
    _focusNode.requestFocus();
    setState(() {});
  }

  Future<void> _toggleVoice() async {
    if (_listening) {
      await _speech.stop();
      if (mounted) {
        setState(() => _listening = false);
      }
      return;
    }
    final ready = await _speech.initialize(
      onStatus: (status) {
        if (mounted && status == 'notListening') {
          setState(() => _listening = false);
        }
      },
    );
    if (!ready || !mounted) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Voice input is unavailable on this device.')),
        );
      }
      return;
    }
    setState(() => _listening = true);
    await _speech.listen(
      onResult: (result) {
        _textController.text = result.recognizedWords;
        _textController.selection = TextSelection.collapsed(
          offset: _textController.text.length,
        );
        if (mounted) {
          setState(() {});
        }
      },
      listenOptions: SpeechListenOptions(onDevice: false),
    );
  }

  Future<void> _send() async {
    final content = _textController.text;
    if (content.trim().isEmpty) {
      return;
    }
    _textController.clear();
    await _speech.stop();
    if (mounted) {
      setState(() => _listening = false);
    }
    await ref.read(chatControllerProvider.notifier).send(content);
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(chatControllerProvider, (_, __) => _scrollToEnd());
    final state = ref.watch(chatControllerProvider);
    final configuration = ref.watch(suChatConfigurationProvider);
    final showWelcome = state.messages.isEmpty && !state.isLoading;
    final messages = showWelcome
        ? [
            ChatMessage(
              id: 'welcome',
              role: ChatRole.assistant,
              content: configuration.welcomeMessage,
              createdAt: DateTime.now(),
            ),
          ]
        : state.messages;

    return Scaffold(
      backgroundColor: _canvas,
      appBar: AppBar(
        toolbarHeight: 78,
        elevation: 0,
        foregroundColor: Colors.white,
        backgroundColor: Colors.transparent,
        flexibleSpace: const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [_suGreen, _deepGreen, Color(0xFF164A6E)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
        ),
        titleSpacing: 4,
        title: Row(
          children: [
            const _AssistantAvatar(size: 46, light: true),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.title,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.2,
                    ),
                  ),
                  const SizedBox(height: 3),
                  const Row(
                    children: [
                      _OnlineDot(),
                      SizedBox(width: 6),
                      Text(
                        'Online · Student support',
                        style:
                            TextStyle(fontSize: 11.5, color: Color(0xCCFFFFFF)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 10),
            child: IconButton(
              tooltip: 'Privacy information',
              onPressed: () => showModalBottomSheet<void>(
                context: context,
                showDragHandle: true,
                builder: (_) => const _PrivacySheet(),
              ),
              icon: const Icon(Icons.shield_outlined, size: 21),
            ),
          ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            const _TrustStrip(),
            Expanded(
              child: ListView(
                controller: _scrollController,
                padding: const EdgeInsets.fromLTRB(14, 20, 14, 12),
                children: [
                  for (final message in messages)
                    _MessageBubble(message: message),
                  if (showWelcome) _Suggestions(onSelected: _selectSuggestion),
                  if (state.isLoading) const _TypingIndicator(),
                ],
              ),
            ),
            if (state.error != null)
              _ErrorNotice(
                message: state.error!,
                onRetry: () =>
                    ref.read(chatControllerProvider.notifier).initialize(),
              ),
            if (_listening) const _ListeningBar(),
            _Composer(
              controller: _textController,
              focusNode: _focusNode,
              listening: _listening,
              busy: state.isLoading,
              onVoice: _toggleVoice,
              onSend: _send,
            ),
          ],
        ),
      ),
    );
  }
}

class _TrustStrip extends StatelessWidget {
  const _TrustStrip();

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
        color: const Color(0xFFF8FBFA),
        child: const Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.verified_user_outlined, size: 15, color: _suGreen),
            SizedBox(width: 7),
            Flexible(
              child: Text(
                'Grounded in approved university sources',
                style: TextStyle(fontSize: 11, color: Color(0xFF52645C)),
              ),
            ),
          ],
        ),
      );
}

class _AssistantAvatar extends StatelessWidget {
  const _AssistantAvatar({required this.size, this.light = false});

  final double size;
  final bool light;

  @override
  Widget build(BuildContext context) => Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            width: size,
            height: size,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: light ? const Color(0xFFF0FAF5) : _suGreen,
              borderRadius: BorderRadius.circular(size * .32),
              boxShadow: const [
                BoxShadow(
                    color: Color(0x1F003F30),
                    blurRadius: 10,
                    offset: Offset(0, 3)),
              ],
            ),
            child: Text(
              'SU',
              style: TextStyle(
                color: light ? _deepGreen : Colors.white,
                fontWeight: FontWeight.w800,
                fontSize: size * .29,
              ),
            ),
          ),
          Positioned(
            right: -2,
            bottom: -2,
            child: Container(
              width: size * .28,
              height: size * .28,
              decoration: BoxDecoration(
                color: const Color(0xFF4CDB89),
                shape: BoxShape.circle,
                border:
                    Border.all(color: light ? _deepGreen : _canvas, width: 2.5),
              ),
            ),
          ),
        ],
      );
}

class _OnlineDot extends StatelessWidget {
  const _OnlineDot();

  @override
  Widget build(BuildContext context) => Container(
        width: 7,
        height: 7,
        decoration: const BoxDecoration(
            color: Color(0xFF57E698), shape: BoxShape.circle),
      );
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final mine = message.role == ChatRole.user;
    final time =
        TimeOfDay.fromDateTime(message.createdAt.toLocal()).format(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 15),
      child: Row(
        mainAxisAlignment:
            mine ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!mine) ...[
            const _AssistantAvatar(size: 29),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Column(
              crossAxisAlignment:
                  mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
                Container(
                  constraints: const BoxConstraints(maxWidth: 620),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                  decoration: BoxDecoration(
                    gradient: mine
                        ? const LinearGradient(
                            colors: [_suBlue, Color(0xFF144E82)])
                        : null,
                    color: mine ? null : Colors.white,
                    border: mine
                        ? null
                        : Border.all(color: const Color(0xFFE3EAE6)),
                    borderRadius: BorderRadius.circular(18).copyWith(
                      bottomRight: mine ? const Radius.circular(5) : null,
                      bottomLeft: mine ? null : const Radius.circular(5),
                    ),
                    boxShadow: const [
                      BoxShadow(
                          color: Color(0x0F1F3D32),
                          blurRadius: 12,
                          offset: Offset(0, 3)),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      MarkdownBody(
                        data: message.content,
                        selectable: true,
                        styleSheet:
                            MarkdownStyleSheet.fromTheme(Theme.of(context))
                                .copyWith(
                          p: TextStyle(
                            color: mine ? Colors.white : _ink,
                            height: 1.45,
                            fontSize: 14,
                          ),
                          strong: TextStyle(
                            color: mine ? Colors.white : _ink,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      if (message.citations.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        Divider(
                            color: mine
                                ? const Color(0x40FFFFFF)
                                : const Color(0xFFE3EAE6)),
                        const SizedBox(height: 4),
                        for (final citation in message.citations)
                          Padding(
                            padding: const EdgeInsets.only(top: 5),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  Icons.description_outlined,
                                  size: 14,
                                  color: mine ? Colors.white70 : _suGreen,
                                ),
                                const SizedBox(width: 7),
                                Flexible(
                                  child: Text(
                                    citation.title,
                                    style: TextStyle(
                                      color: mine ? Colors.white : _deepGreen,
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(top: 4, left: 4, right: 4),
                  child: Text(
                    mine ? time : 'SU Assistant · $time',
                    style:
                        const TextStyle(fontSize: 10, color: Color(0xFF89958F)),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Suggestions extends StatelessWidget {
  const _Suggestions({required this.onSelected});

  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    const suggestions = [
      'Fee deadlines',
      'Semester registration',
      'Academic advising'
    ];
    return Padding(
      padding: const EdgeInsets.only(left: 37, bottom: 12),
      child: Wrap(
        spacing: 7,
        runSpacing: 7,
        children: [
          for (final value in suggestions)
            ActionChip(
              label: Text(value),
              onPressed: () => onSelected(value),
              backgroundColor: Colors.white,
              side: const BorderSide(color: Color(0xFFCFE0D8)),
              labelStyle: const TextStyle(
                color: _deepGreen,
                fontSize: 11.5,
                fontWeight: FontWeight.w500,
              ),
              shape: const StadiumBorder(),
            ),
        ],
      ),
    );
  }
}

class _TypingIndicator extends StatelessWidget {
  const _TypingIndicator();

  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.only(bottom: 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            _AssistantAvatar(size: 29),
            SizedBox(width: 8),
            DecoratedBox(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(17),
                  topRight: Radius.circular(17),
                  bottomRight: Radius.circular(17),
                  bottomLeft: Radius.circular(5),
                ),
              ),
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: 14, vertical: 13),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _TypingDot(opacity: .55),
                    SizedBox(width: 4),
                    _TypingDot(opacity: .75),
                    SizedBox(width: 4),
                    _TypingDot(opacity: 1),
                  ],
                ),
              ),
            ),
          ],
        ),
      );
}

class _TypingDot extends StatelessWidget {
  const _TypingDot({required this.opacity});

  final double opacity;

  @override
  Widget build(BuildContext context) => Opacity(
        opacity: opacity,
        child: Container(
          width: 6,
          height: 6,
          decoration:
              const BoxDecoration(color: _muted, shape: BoxShape.circle),
        ),
      );
}

class _ListeningBar extends StatelessWidget {
  const _ListeningBar();

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.fromLTRB(12, 0, 12, 6),
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
        decoration: BoxDecoration(
            color: const Color(0xFFE7F4EE),
            borderRadius: BorderRadius.circular(12)),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.graphic_eq_rounded, size: 18, color: _suGreen),
            SizedBox(width: 8),
            Text('Listening… tap the microphone to stop',
                style: TextStyle(fontSize: 11.5, color: _deepGreen)),
          ],
        ),
      );
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.focusNode,
    required this.listening,
    required this.busy,
    required this.onVoice,
    required this.onSend,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final bool listening;
  final bool busy;
  final VoidCallback onVoice;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.fromLTRB(10, 10, 10, 9),
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: Color(0xFFE3EAE6))),
        ),
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(5, 4, 5, 4),
              decoration: BoxDecoration(
                color: const Color(0xFFFAFCFB),
                border: Border.all(color: const Color(0xFFD8E1DD)),
                borderRadius: BorderRadius.circular(19),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  IconButton(
                    tooltip: listening ? 'Stop listening' : 'Use voice input',
                    color: listening ? _suGold : _muted,
                    style: IconButton.styleFrom(
                      backgroundColor: listening
                          ? const Color(0xFFFFF6DA)
                          : Colors.transparent,
                    ),
                    onPressed: onVoice,
                    icon: Icon(
                        listening ? Icons.mic_rounded : Icons.mic_none_rounded,
                        size: 21),
                  ),
                  Expanded(
                    child: TextField(
                      controller: controller,
                      focusNode: focusNode,
                      minLines: 1,
                      maxLines: 5,
                      textInputAction: TextInputAction.newline,
                      decoration: const InputDecoration(
                        hintText: 'Type your question…',
                        hintStyle:
                            TextStyle(color: Color(0xFF8A9691), fontSize: 14),
                        border: InputBorder.none,
                        contentPadding:
                            EdgeInsets.symmetric(horizontal: 4, vertical: 12),
                      ),
                    ),
                  ),
                  IconButton.filled(
                    tooltip: 'Send message',
                    style: IconButton.styleFrom(
                      backgroundColor: _suGreen,
                      disabledBackgroundColor: const Color(0xFFB8CCC4),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(13)),
                    ),
                    onPressed: busy ? null : onSend,
                    icon: const Icon(Icons.send_rounded, size: 19),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 7),
            const Text(
              'SU Assistant can make mistakes. Verify important information.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 9.5, color: Color(0xFF97A19C)),
            ),
          ],
        ),
      );
}

class _ErrorNotice extends StatelessWidget {
  const _ErrorNotice({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        padding: const EdgeInsets.fromLTRB(12, 8, 6, 8),
        decoration: BoxDecoration(
          color: const Color(0xFFFFF8DF),
          border: Border.all(color: const Color(0xFFF0D27B)),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            const Icon(Icons.info_outline, size: 18, color: Color(0xFF684D00)),
            const SizedBox(width: 8),
            Expanded(
                child: Text(message, style: const TextStyle(fontSize: 11.5))),
            TextButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      );
}

class _PrivacySheet extends StatelessWidget {
  const _PrivacySheet();

  @override
  Widget build(BuildContext context) => const SafeArea(
        child: Padding(
          padding: EdgeInsets.fromLTRB(24, 8, 24, 28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.shield_outlined, color: _suGreen, size: 30),
              SizedBox(height: 12),
              Text('Private by design',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
              SizedBox(height: 8),
              Text(
                'Your credentials stay with Strathmore systems. The assistant only uses the minimum authorised information needed to answer your question.',
                style: TextStyle(height: 1.5, color: _muted),
              ),
            ],
          ),
        ),
      );
}
