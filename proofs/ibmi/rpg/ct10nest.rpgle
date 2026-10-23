**free
ctl-opt dftactgrp(*no) actgrp(*caller);
dcl-pr send extpgm('QSYS/QMHSNDPM');
  id char(7) const;
  file char(20) const;
  data char(256) const;
  size int(10) const;
  kind char(10) const;
  stack char(10) const;
  counter int(10) const;
  key char(4);
  error char(8);
end-pr;
dcl-s key char(4);
dcl-s error char(8) inz(*allx'00');
dcl-s i int(10);
for i = 1 to 2;
  send('CPF9898': 'QCPFMSG   QSYS      ': 'CT10:nested': 11:
    '*INFO': '*EXT': 0: key: error);
endfor;
*inlr = *on;
