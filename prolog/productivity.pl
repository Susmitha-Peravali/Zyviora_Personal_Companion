% productivity.pl
% Module to provide productivity guidance, scheduling, and anti-procrastination tips.

% Companion Mode: Encouraging and action-oriented. Uses keyword matching.

productivity_tip(Input, 'It happens to the best of us, don''t be too hard on yourself. Try the Pomodoro technique: 25 minutes of focused work, followed by a 5-minute break. What task are you putting off right now?') :-
    (sub_atom(Input, _, _, _, 'procrastinat') ; sub_atom(Input, _, _, _, 'put off')), !.

productivity_tip(Input, 'Remove physical and digital distractions, and break your work into smaller, manageable chunks. What is the smallest, easiest step you can take right now to get started?') :-
    (sub_atom(Input, _, _, _, 'focus') ; sub_atom(Input, _, _, _, 'distract') ; sub_atom(Input, _, _, _, 'concentrat')), !.

productivity_tip(Input, 'Burnout is very real. It''s essential that you step away and take a break. Your mental health comes first. What is something relaxing you can do for yourself today?') :-
    (sub_atom(Input, _, _, _, 'burn out') ; sub_atom(Input, _, _, _, 'burnt out') ; sub_atom(Input, _, _, _, 'exhaust')), !.

productivity_tip(Input, 'Of course! Let''s start simple. Write down your top 3 most important tasks for today. What is the number one priority that you absolutely want to get done?') :-
    (sub_atom(Input, _, _, _, 'plan') ; sub_atom(Input, _, _, _, 'schedule') ; sub_atom(Input, _, _, _, 'organiz')), !.

productivity_tip(Input, 'Motivation fluctuates, and that is completely normal. Sometimes action creates motivation. Can you think of why you started this goal in the first place?') :-
    (sub_atom(Input, _, _, _, 'motivat') ; sub_atom(Input, _, _, _, 'lazy') ; sub_atom(Input, _, _, _, 'give up')), !.
