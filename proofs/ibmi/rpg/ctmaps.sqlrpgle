**free
ctl-opt nomain option(*srcstmt : *nodebugio);

// Compiler avec le CCSID de données candidat. Aucun include de ckool.
dcl-proc CTMap export;
  dcl-pi *n int(10);
    payload likeds(value);
  end-pi;
  dcl-ds value qualified template;
    fixed char(16);
    shortText varchar(32 : 2);
    longText varchar(32 : 4);
    integer int(10);
    amount packed(31 : 9);
    numbers int(10) dim(3);
  end-ds;
  payload.longText = 'réponse  ';
  payload.integer = 2147483647;
  payload.amount += 0.000000001;
  payload.numbers(1) = 2147483647;
  payload.numbers(3) = -1;
  return 42;
end-proc;
