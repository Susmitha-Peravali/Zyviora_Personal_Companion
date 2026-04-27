% interview.pl
% Module to help users prepare for interviews.

% Companion Mode: Always encourage self-expression and elaboration. Uses keyword matches.

provide_interview_tip(Input, 'Start by researching the company and its core values. Being familiar with their mission helps you stand out! What kind of role are you interviewing for?') :-
    (sub_atom(Input, _, _, _, 'how to prepare') ; sub_atom(Input, _, _, _, 'prepare for interview')), !.

provide_interview_tip(Input, 'For technical interviews, make sure to talk through your thought process out loud when solving a problem. Interviewers love seeing how you think. Do you have a specific algorithm or code concept you want to practice?') :-
    (sub_atom(Input, _, _, _, 'technical') ; sub_atom(Input, _, _, _, 'coding interview')), !.

provide_interview_tip(Input, 'A great way to answer about weaknesses is to pick a real, non-essential weakness and explain the proactive steps you are taking to improve it. What''s a skill you''ve been actively working on lately?') :-
    sub_atom(Input, _, _, _, 'weakness'), !.

provide_interview_tip(Input, 'Confidence is key! Sit up straight, maintain good eye contact, and remember to smile. It''s just a conversation. What part of the interview process makes you the most nervous?') :-
    (sub_atom(Input, _, _, _, 'act in an interview') ; sub_atom(Input, _, _, _, 'nervous about interview') ; sub_atom(Input, _, _, _, 'interview tips')), !.

provide_interview_tip(Input, 'That’s incredibly exciting, you’re going to do great! Have a good night''s sleep and trust your preparation. Do you want to run through one mock question right now?') :-
    (sub_atom(Input, _, _, _, 'tomorrow') ; sub_atom(Input, _, _, _, 'soon')),
    sub_atom(Input, _, _, _, 'interview'), !.
