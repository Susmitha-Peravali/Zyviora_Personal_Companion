% wordle_game.pl
% Module for the interactive Wordle logic in Prolog.

% For text-based Companion Mode:
wordle_support(Input, 'I''d love to play Wordle with you! You can click the "Play Wordle" button on the sidebar to open the visual game. If you want to play right here in the chat, just guess a 5 letter word!') :-
    (sub_atom(Input, _, _, _, 'play wordle') ; sub_atom(Input, _, _, _, 'start wordle')), !.

wordle_support(Input, 'Good guess! Let''s pretend it had one correct letter. Keep trying! (Note: the full text-based engine is still expanding, please use the UI widget to play!)') :-
    sub_atom(Input, _, _, _, 'guess'), !.
