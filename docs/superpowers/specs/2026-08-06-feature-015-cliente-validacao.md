# Como o custo dos produtos passa a funcionar  
*(texto para validação com o cliente — linguagem de negócio)*

**Data:** 2026-08-06  
**Assunto:** atualização do custo do produto a partir das compras confirmadas

---

## Em uma frase

Quando uma **compra for confirmada** no Farol, o sistema passa a usar o **preço unitário daquela compra** como o **custo atual** do produto — e esse custo alimenta a **sugestão de pedido**.

---

## O problema que isso resolve

Hoje o Farol sugere quanto comprar usando um custo cadastrado no produto (ou no vínculo com o fornecedor). Esse valor pode estar **desatualizado** em relação ao que realmente foi pago na nota fiscal.

Com as compras entrando pelo XML e pelo BLING, o Farol passa a ter o preço **real da última compra confirmada**.

---

## Como o fluxo foi pensado (dia a dia)

### 1. A compra entra no Farol
- Pelo **XML** (manual), ou  
- Pelo **BLING** (automático), ou  
- Digitada na tela de Compras  

Enquanto estiver em **rascunho**, **nada muda** no custo do produto. Dá para revisar itens e valores com calma.

### 2. Alguém confirma a compra
Nesse momento o Farol entende: “essa mercadoria entrou e esse foi o preço pago”.

Para **cada produto** da compra confirmada:
- O **custo do produto** é atualizado para o valor unitário daquela linha  
- Se aquele produto já tiver vínculo com o **mesmo fornecedor** da compra, o custo **desse vínculo** também é atualizado  

Assim, na hora de montar o pedido, o sistema usa o preço alinhado ao fornecedor certo (quando existir esse vínculo).

### 3. O pedido / Farol passa a enxergar o novo custo
Na próxima vez que a lista ou o pedido for calculado, o valor usado para aquele produto já reflete a **última compra confirmada**.

Não é preciso “recalcular o Farol na mão” só por causa do custo: ele lê o custo que acabou de ser atualizado.

### 4. Se a compra for cancelada
- O **estoque** volta atrás (como já combinado nas compras)  
- O **custo do produto não volta** ao valor antigo  

Motivo: manter simples. O custo só muda de novo na **próxima compra confirmada**.  
(Se no futuro quiserem “voltar o custo ao da compra anterior” ao cancelar, isso pode ser uma evolução — **não** está neste primeiro momento.)

---

## O que entra e o que não entra neste primeiro momento

### Entra
- Custo = **último preço pago** em compra **confirmada**  
- Vale para compras de qualquer origem (XML, BLING, manual)  
- Atualiza o produto e, quando fizer sentido, o vínculo com aquele fornecedor  
- Há um **ajuste inicial** nos produtos que **já têm** compras confirmadas no sistema (para não esperar só as próximas notas)

### Não entra (ainda)
- Média de custos de várias notas (só o **último**)  
- Tela nova de “histórico de preço”  
- Proteger um custo digitado à mão para a próxima nota **não** sobrescrever (a próxima confirmação **sempre** atualiza)  
- Gerar a compra direto a partir do pedido do Farol (isso é a **próxima** etapa do roadmap, depois desta)

---

## Exemplos rápidos para alinhar expectativa

**Exemplo A**  
Compra confirmada: Vinho X a R$ 42,00 no fornecedor Vinícola Y.  
→ Custo do Vinho X passa a R$ 42,00.  
→ Se Vinho X estiver ligado à Vinícola Y, esse vínculo também fica R$ 42,00.  
→ O pedido passa a “pensar” com R$ 42,00.

**Exemplo B**  
A mesma compra ainda está em rascunho.  
→ Custo do produto **não muda**.

**Exemplo C**  
Compra confirmada e depois **cancelada**.  
→ Estoque desfaz a entrada.  
→ Custo continua R$ 42,00 até outra compra confirmada trazer um preço novo.

**Exemplo D**  
Duas compras confirmadas do mesmo produto em dias diferentes (R$ 40 e depois R$ 45).  
→ Vale o da **mais recente** confirmada (R$ 45).

---

## Perguntas para o cliente validar

1. Concorda que o custo relevante para o pedido é o da **última compra confirmada** (e não uma média)?  
2. Concorda que **cancelar** a compra **não** deve “desfazer” o custo, só o estoque?  
3. Concorda que um custo ajustado na mão pode ser **substituído** na próxima compra confirmada?  
4. Falta alguma regra do dia a dia de vocês (ex.: “nunca atualizar custo de marca X”, “só atualizar se a diferença for maior que Y%”)?

---

## Encaixe no caminho do produto (contexto curto)

1. **Agora (esta etapa):** custo da última compra → alimenta o Farol  
2. **Depois:** gerar compra a partir do pedido sugerido  
3. **Em seguida:** painel gerencial (números de entradas, rascunhos, etc.)  

A sincronização com o BLING continua rodando; com o tempo o histórico fica mais completo e o custo mais “real” sozinho.
