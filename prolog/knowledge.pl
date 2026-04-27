% knowledge.pl
% Module for providing facts, trivia, or handling specific knowledge query logic.

% Companion Mode: Informative but retaining the conversational flow. Uses keyword matches.

fact(Input, 'I am Zyviora, your personal companion and assistant! I am here to help you thrive, whether you need advice, facts, or just someone to chat with. What is something you like to do in your free time?') :-
    (sub_atom(Input, _, _, _, 'who are you') ; sub_atom(Input, _, _, _, 'what are you')), !.

fact(Input, 'That is a beautifully big question! Philosophers have debated it forever, but many say it is to find what makes you happy and share it with others. What brings you the most joy in your life?') :-
    (sub_atom(Input, _, _, _, 'meaning of life') ; sub_atom(Input, _, _, _, 'purpose of life')), !.

fact(Input, 'Did you know that honey never spoils? Archaeologists have found pots of honey in ancient Egyptian tombs that are over 3,000 years old and still perfectly good to eat! Pretty sweet, right?') :-
    (sub_atom(Input, _, _, _, 'fun fact') ; sub_atom(Input, _, _, _, 'tell me a fact')), !.

fact(Input, 'I can do a lot! I offer emotional support, help you prepare for interviews, give productivity tips, assist with decision making, and even play Wordle. What would you like to explore first?') :-
    (sub_atom(Input, _, _, _, 'what can you do') ; sub_atom(Input, _, _, _, 'help me')), !.
