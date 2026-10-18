import pytest

from research_service.envelope import ToolError
from research_service.guards import reject_synthetic


@pytest.mark.parametrize("name", ["SUPP_00018", "supp_00018", "BRK_0020", " BRK_0020 ", "Research BRK_0046 please"])
def test_dataset_ids_are_rejected(name):
    with pytest.raises(ToolError) as e:
        reject_synthetic(name)
    assert e.value.code == "SYNTHETIC_ENTITY"


@pytest.mark.parametrize("name", ["Knorr-Bremse", "Wabtec Corporation", "Vossloh AG", "Brakes India Private Limited"])
def test_real_company_names_pass(name):
    assert reject_synthetic(name) == name


def test_empty_name_is_invalid():
    with pytest.raises(ToolError) as e:
        reject_synthetic("   ")
    assert e.value.code == "INVALID_INPUT"
