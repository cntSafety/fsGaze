Safety Status
==============

Shared information input for actions requiring independance
------------------------------------------------------------

.. req:: AccDFA
   :id: REQ_4AAC4005-CFCA-47FF-8597-D7615B132950
   :asil: D
   :collapse: false

   This is a SysML-v2 requirement exported to sphinx needs ... test

The following actions share common input source(s) and should satisfy the :need:`DFA requirement <R_003>`:

.. arch:: process RBG image
    :id: A_114AD80A-9165-489E-B930-8FB8F692921C
    :tags: action
    :layout: clean_l
    :collapse: true
    :links: R_003

.. arch:: process IR image
    :id: A_01C85FD6-B09E-41C2-BDEA-49C990AB1CA1
    :tags: action
    :layout: clean_l
    :collapse: true
    :links: R_003

Common source(s) of input:

.. arch:: provide Sync
    :id: A_712D6D9B-4278-4E82-8D3A-2A2589361327
    :tags: source
    :layout: clean_l
    :collapse: false

    Providing sync parameter



The following actions share common input source(s) and should satisfy the :need:`DFA requirement <REQ_4AAC4005-CFCA-47FF-8597-D7615B132950>`:

.. arch:: drive
    :id: A_A02B7E93-2D64-40E4-A37C-F2D499496948
    :tags: action
    :layout: clean_l
    :collapse: true
    :links: REQ_4AAC4005-CFCA-47FF-8597-D7615B132950

.. arch:: drive redundant
    :id: A_B6A2089A-B25D-4042-B81E-9CE0D2C14FE1
    :tags: action
    :layout: clean_l
    :collapse: true
    :links: REQ_4AAC4005-CFCA-47FF-8597-D7615B132950

Common source(s) of input:

.. arch:: supply power
    :id: A_1B4E185A-9445-4224-8265-C006ADC9B7B2
    :tags: source
    :layout: clean_l
    :collapse: false

    Providing power parameter



