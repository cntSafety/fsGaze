Features
========

Tiger Detection Feature
------------------------

.. req:: Tiger Detection Range
   :id: R_001
   :status: open
   :asil: B_D
   :sreqtype: SR
   :collapse: true

   Exploration Assistant shall detect tigers approaching within a 50-meter radius.

.. req:: Tiger Detection IR
   :id: R_002
   :status: open
   :links: R_001
   :asil: B_D
   :sreqtype: SR
   :collapse: true

   Exploration Assistant shall warn the user of the tiger's presence with an audio visual alert within 5 seconds.

.. req:: Test DFA Req
   :id: R_003
   :status: open
   :links: R_001, R_002
   :asil: D
   :sreqtype: DFA
   :collapse: true

   IR-Camera and RGB-Camera shall be independent 

