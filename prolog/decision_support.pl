% decision_support.pl
% Module to aid users in making choices logically.

decide_support(Input, 'Decisions can be overwhelming. A good way to start is by listing out the pros and cons. What are your two main options right now?') :-
    (sub_atom(Input, _, _, _, 'tough decision') ; sub_atom(Input, _, _, _, 'make a decision') ; sub_atom(Input, _, _, _, 'have to choose')), !.

decide_support(Input, 'I can absolutely help you weigh your options. Let''s break it down logically. What is the biggest consequence of picking option A?') :-
    (sub_atom(Input, _, _, _, 'help me decide') ; sub_atom(Input, _, _, _, 'which one')), !.

decide_support(Input, 'It''s okay to feel stuck. Usually, taking a step back gives you a clearer view. If your best friend was in this situation, what advice would you give them?') :-
    (sub_atom(Input, _, _, _, 'don''t know what to do') ; sub_atom(Input, _, _, _, 'am stuck')), !.
